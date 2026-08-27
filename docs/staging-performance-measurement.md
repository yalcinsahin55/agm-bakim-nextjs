# Staging Performans Ölçüm Runbook’u

Bu runbook, kayıt listeleme endpointinin gerçek staging veya preview verisi üzerinde **yalnızca authenticated GET** çağrılarıyla ölçülmesi içindir. Amaç, mevcut regex tabanlı aramanın gerçek kullanımda darboğaz oluşturup oluşturmadığını görmek ve Atlas Search/normalize edilmiş arama gibi daha büyük bir değişikliği ölçüme dayandırmaktır.

## Güvenlik sınırları

Ölçüm canonical production hostunu reddeder. Script yalnızca `GET /api/records?page=1&page_size=25` çağırır; POST, PATCH, DELETE, restore, migration, index değişikliği ve cron çalıştırmaz. Session cookie yalnızca process environment içinden okunur, stdout’a veya JSON çıktısına yazılmaz. Yine de kullanılan staging hesabının en düşük gerekli yetkili test hesabı olması ve gerçek kullanıcı şifresinin komut geçmişine yazılmaması gerekir.

## Çalıştırma

Önce staging/preview origin ve staging hesabından alınmış geçici session cookie sağlanmalıdır. Arama terimleri virgülle ayrılır; çıktıdaki `search#1`, `search#2` adları terimlerin kendisini gizler.

```bash
BASE_URL=https://staging.example.com \
AUTH_COOKIE='agm_session=STAGING_COOKIE' \
RECORD_SEARCH_TERMS='motor adı,teknisyen adı' \
ROUNDS=20 CONCURRENCY=1 \
PERF_OUTPUT=/tmp/agm-records-performance.json \
npm run perf:staging-records
```

Varsayılan değerler `ROUNDS=20`, `CONCURRENCY=1` ve `TIMEOUT_MS=15000`’tir. Script en fazla 40 round, 4 eşzamanlı istek ve 4 arama terimi kabul eder; toplam örnek sayısını 200 ile sınırlar. Her vaka için bir warm-up isteği ölçüme dahil edilmez.

## Ölçümlerin anlamı

`client_ms`, scriptin çalıştığı makineden görülen uçtan uca GET süresidir; ağ, TLS, Vercel runtime ve uygulama süresini birlikte içerir. `server_timing_ms`, uygulamanın `Server-Timing: app;dur=...` header’ından alınan route süresidir. Bu iki değer tek başına MongoDB’nin p50/p95 süresi değildir. `lib/performance.ts` içindeki DB timing olayları ve gerekiyorsa staging MongoDB `explain("executionStats")` çıktısı ayrı incelenmelidir.

Her vaka için baseline ve arama sonuçlarının p50, p95, maksimum, HTTP durum dağılımı ve Server-Timing p50/p95 değerleri raporlanır. Beklenen tüm yanıtlar HTTP 200 olmalıdır. 4xx/5xx, timeout veya beklenmeyen auth davranışı varsa sonuç performans kanıtı olarak kabul edilmez.

## Atlas Search karar kuralı

Ölçüm tamamlanmadan Atlas Search’e geçiş yapılmaz. Önce aynı staging veri kümesi, aynı page size ve aynı arama terimleriyle baseline/search karşılaştırması alınır. P95 farkı belirginse, veri hacmi ve MongoDB execution statistics ile bunun regex taraması mı yoksa route/runtime etkisi mi olduğu ayrıştırılır. Atlas Search ancak tekrarlanabilir ölçüm, gerçek veri hacmi, index maliyeti, deployment/rollback planı ve arama davranışı için kabul testleri birlikte olumluysa ayrı bir PR ile değerlendirilir.

Production loglarında ölçüm dönemi için yeterli `/api/records` örneği yoksa p50/p95 çıkarılmaz ve bu durum açıkça “ölçüm bekliyor” olarak raporlanır. Uydurma veri, sentetik süre veya production’a load test uygulanması kabul edilmez.
