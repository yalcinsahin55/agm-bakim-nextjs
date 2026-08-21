type CacheEntry<T> = {
  data?: T;
  promise?: Promise<T>;
  time: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

/** Basit istek önbelleği: Aynı API çağrısı kısa süre içinde birden fazla
 *  component tarafından yapılırsa TEK istek atılır, sonuç paylaşılır.
 *  Bu, her sayfa açılışında atılan 3-4 gereksiz isteği engeller. */
export async function cachedFetch<T = unknown>(url: string, ttlMs = 30000): Promise<T> {
  const now = Date.now();
  const entry = cache.get(url) as CacheEntry<T> | undefined;

  // Geçerli önbellek varsa direkt dön (ağa hiç çıkmaz)
  if (entry && entry.data !== undefined && now - entry.time < ttlMs) {
    return entry.data;
  }

  // Aynı anda devam eden istek varsa onu bekle (çift istek atılmaz)
  if (entry && entry.promise) {
    return entry.promise;
  }

  const promise = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as T;
      cache.set(url, { data, time: Date.now(), promise: null });
      return data;
    })
    .catch((err) => {
      cache.delete(url);
      throw err;
    });

  cache.set(url, { promise, time: now });
  return promise as Promise<T>;
}
