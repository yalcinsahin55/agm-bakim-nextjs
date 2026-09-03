# AGM Bakım Performans Darboğazı İncelemesi

**İnceleme tarihi:** 3 Eylül 2026  
**Kapsam:** Frontend veri yükleme, API sorguları, MongoDB pagination/index kullanımı, payload boyutu, bundle ve gözlemlenebilirlik  
**Yöntem:** Kaynak kodu taraması, production build çıktısı ve mevcut staging ölçüm prosedürünün incelenmesi. Staging ortamına authenticated istek atılmadığı için bu rapordaki süreler sentetik tahmin değil, doğrulanması gereken hipotezlerdir.

## Yönetici özeti

Projenin performans temeli iyi durumdadır. Kayıt listesi sayfalıdır, ağır medya alanları varsayılan olarak dışarıda bırakılır, analytics için kısa süreli cache bulunur, birçok ekran ortak `usePageData` veya `useAbortableFetch` desenini kullanır ve API’lerde Server-Timing gözlemlenebilirliği vardır.

Buna rağmen, en yüksek öncelikli teknik risk `kayitlar` ekranının merkezi veri hook’unda devam eden isteklerin iptal edilmemesidir. Kullanıcı hızlı arama, filtre veya sayfa değiştirirse eski yanıt yeni state’i ezebilir ve gereksiz backend yükü oluşabilir. İkinci ana konu, kayıt ve audit listelerinde her sayfa isteğinde veri sorgusuna ek olarak `countDocuments` çalışmasıdır. Üçüncü konu, arama alanlarının case-insensitive regex ile taranmasıdır. Bu yaklaşım veri büyüdükçe index’lerden sınırlı yararlanabilir.

Bu bulguların çoğu ölçümle doğrulanmalıdır. Özellikle regex araması ve `countDocuments` için mevcut staging ölçüm scripti kullanılmadan Atlas Search veya daha kapsamlı index değişikliğine geçilmemelidir.

## Önceliklendirilmiş bulgular

| Öncelik | Alan | Bulgulanabilir sorun | Etki | Güven | Önerilen ilk adım |
|---|---|---|---|---|---|
| P1 | Kayıtlar frontend | `useRecordsPageData` içinde fetch çağrıları AbortController kullanmıyor | Eski yanıtın yeni filtreyi ezmesi, gereksiz istek ve render | Yüksek | Hook’a request yaşam döngüsü eklemek; arama/filtre değişiminde önceki isteği iptal etmek |
| P1 | Kayıtlar API | Arama üç alanda case-insensitive regex ile yapılıyor | Veri büyüdükçe CPU, scan ve p95 gecikmesi artabilir | Yüksek | Staging scripti ile baseline/search p50-p95 ölçmek; sonra normalize alan veya Atlas Search kararı vermek |
| P1 | Kayıtlar API | Her sayfa isteğinde `countDocuments(query)` çalışıyor | Liste sorgusuna ek DB maliyeti; karmaşık aramada gecikme | Yüksek | UI ihtiyacı doğrulanırsa `hasNextPage`/cursor veya kısa süreli count stratejisi değerlendirmek |
| P1 | Serverless/MongoDB | `ensureAppIndexes(db)` request yolunda çağrılıyor | Cold start veya yeni instance’ta ilk istek index kontrolünü bekleyebilir | Orta-yüksek | Index migration’ını deployment operasyonuna taşımak; request path bağımlılığını ölçerek azaltmak |
| P2 | Audit log API | Liste sorgusu regex + `countDocuments` kombinasyonu kullanıyor | Büyük audit koleksiyonunda p95 ve CPU artışı | Yüksek | `details=0` akışını ve arama dışı akışı ayrı ölçmek; gerekli composite index’leri execution stats ile doğrulamak |
| P2 | Pagination | Kayıtlar sayfası offset pagination kullanıyor | Çok yüksek sayfalarda `skip` maliyeti büyüyebilir | Yüksek | Varsayılan akışı cursor pagination’a taşımayı veya derin sayfa sınırı koymayı değerlendirmek |
| P2 | Kayıtlar frontend | Referans verileri ilk yüklemede kayıt sorgusuyla birlikte isteniyor | İlk ekran için üç network isteği ve daha uzun waterfall | Orta | Motor/tür verisini cache’li ortak loader ile tekilleştirmek; mevcut cache davranışını korumak |
| P2 | QR frontend | Tüm QR görselleri aynı anda `Promise.all` ile üretiliyor | Çok sayıda motor/türde main-thread CPU sıçraması ve INP düşüşü | Orta | Batch üretim veya yalnızca görünür/seçili etiketleri üretme; QR sayısı büyüdüğünde ölçmek |
| P3 | Bundle | PDF worker yaklaşık 1,4 MB; static bundle toplamı yaklaşık 3,3 MB | İlk yükleme veya ilgili route’ta network/cache maliyeti | Orta | Worker’ın yalnızca PDF ekranında yüklenmesini ve route-level bundle dağılımını analiz etmek |
| P3 | Dashboard render | `healthRows` içinde her motor için tüm bakım item’ları tekrar taranıyor | Veri hacmi büyürse O(motor × item) client CPU maliyeti | Orta | Önce Performance trace ile ölçmek; gerekirse item’ları motor ID’ye göre Map ile gruplayarak tek geçiş yapmak |

## P1 — Kayıtlar sayfasındaki iptalsiz istekler

`app/kayitlar/_hooks/useRecordsPageData.ts` içinde `load` fonksiyonu kayıtlar, motorlar ve bakım türleri için doğrudan `fetch` çağrıları yapıyor. Arama değişiminde 300 ms debounce bulunmasına rağmen debounce yalnızca timer’ı iptal ediyor; timer çalıştıktan sonra başlayan network isteği iptal edilmiyor.

Mevcut akışın kritik kısmı şöyledir:

```ts
const requests: Promise<Response>[] = [
  fetch(`/api/records?${params}`),
];
```

Bu yapı şu yarış koşuluna izin verir:

1. Kullanıcı `motor A` araması yapar.
2. İstek başlar.
3. Kullanıcı `motor B` aramasına geçer.
4. `motor B` isteği önce tamamlanır ve state’i günceller.
5. `motor A` isteği daha sonra tamamlanır ve eski listeyi geri yazabilir.

### Önerilen düzeltme

Hook içinde her `load` çağrısı için yeni bir `AbortController` oluşturulmalı, önceki controller iptal edilmeli ve cleanup sırasında aktif controller abort edilmelidir. `AbortError` normal bir iptal olarak ele alınmalı; kullanıcıya hata toast’ı gösterilmemelidir. `referenceDataLoadedRef` için de ilk referans yüklemesi başarısız olduğunda tekrar denenebilir bir durum korunmalıdır.

Bu düzeltme, yalnızca kullanıcı arayüzü doğruluğunu artırmaz. Hızlı filtre değişimlerinde backend’e ulaşan gereksiz istek sayısını da azaltır.

## P1 — Regex araması

`app/api/records/_lib/recordsQuery.ts` içindeki arama üç alanda case-insensitive regex kullanıyor:

```ts
query.$or = [
  { engine_name: { $regex: escaped, $options: "i" } },
  { type_label: { $regex: escaped, $options: "i" } },
  { technician_name: { $regex: escaped, $options: "i" } },
];
```

`app/api/audit-logs/route.ts` de kullanıcı adı, kullanıcı ID’si, özet ve entity ID üzerinde benzer bir `$or` regex araması kullanıyor. Bu tasarım işlevsel olarak doğru olabilir; ancak veri büyüdükçe arama maliyetinin gerçek staging hacminde ölçülmesi gerekir. Alanın başında sabit prefix gerektirmeyen aramalar klasik B-tree index’ten sınırlı yararlanabilir.

Projede bu risk için `scripts/staging-record-search-measure.mts` ve `docs/staging-performance-measurement.md` zaten bulunuyor. Ölçüm şu ayrımı yapmalıdır:

| Ölçüm | Anlamı |
|---|---|
| `client_ms` | İstemci makinesinden görülen uçtan uca süre |
| `server_timing_ms` | Route içinde ölçülen uygulama süresi |
| MongoDB execution stats | Sorgunun scan, examined rows ve gerçek DB maliyeti |

Ölçüm alınmadan Atlas Search’e geçmek veya çok sayıda yeni index eklemek erken optimizasyon olur. İlk karar, aynı veri seti ve aynı arama terimleriyle baseline ve search p95 farkına dayanmalıdır.

## P1 — Her sayfada total count maliyeti

`app/api/records/_lib/recordsQuery.ts` sayfalı isteklerde şu iki işlemi paralel yürütüyor:

```ts
const [records, total] = await Promise.all([
  recordsCol.find(query).sort(sortSpec).skip(skip).limit(pageSize).toArray(),
  recordsCol.countDocuments(query),
]);
```

Paralellik toplam wall-clock süresini azaltabilir; ancak veritabanına iki ayrı iş yükü gönderildiği gerçeğini değiştirmez. Özellikle regex aramasında hem liste sorgusu hem count pahalı olabilir.

UI gerçekten toplam sayfa sayısına ihtiyaç duyuyorsa count korunabilir. Aksi durumda cursor pagination ve `hasNextPage` yaklaşımı daha uygun olabilir. Alternatif olarak count yalnızca ilk sayfada hesaplanabilir veya kısa bir TTL ile cache’lenebilir; fakat count’ın güncelliği ürün davranışı açısından açıkça tanımlanmalıdır.

Audit log endpointinde de aynı desen vardır. `details=0` listesi için `countDocuments` kullanılırken detay isteğinde ID ile tek kayıt aranır. Bu iki akışın ayrı ölçülmesi gerekir.

## P1 — Request path’inde index bootstrap

`ensureAppIndexes(db)` hem kayıt sorgusunda hem audit log endpointinde request akışının parçasıdır. Global promise aynı process içinde tekrarları azaltıyor; bu iyi bir koruma. Ancak serverless yeni instance’larında index oluşturma veya kontrol süreci ilk isteğin gecikmesine katkıda bulunabilir.

Ayrıca kayıt koleksiyonunda çok sayıda index bulunuyor. Index’ler okuma performansına yardım eder; ancak her yazma işleminde güncellenmeleri gerektiği için yazma maliyeti, storage ve index build süresi oluştururlar.

Önerilen çalışma:

1. `npm run migrate:app-indexes` ile index’lerin deployment operasyonunda hazırlandığını doğrulamak.
2. Cold start ve warm instance `Server-Timing` değerlerini karşılaştırmak.
3. Index’ler hazırsa request path’inde bootstrap beklemesini kaldırmanın güvenli olup olmadığını ayrı bir değişiklik olarak değerlendirmek.
4. Her index’i gerçek sorgu planı veya operasyonel gereksinimle ilişkilendirmek.

## P2 — Offset pagination yerine cursor pagination

Kayıt API’si cursor pagination destekliyor; ancak `app/kayitlar/_hooks/useRecordsPageData.ts` ve ekranın pagination bileşeni sayfa numarası kullanıyor. Offset pagination’da yüksek sayfa numaralarında veritabanı önce atlanacak kayıtları bulmak zorunda kalabilir.

Cursor geçişi, UI’da toplam sayfa sayısı gösteriminin değişmesini gerektirebilir. Bu nedenle doğrudan değiştirilmemeli; önce gerçek kullanımda derin sayfalara ne kadar gidildiği ve `skip` maliyetinin ölçülmesi gerekir. Kayıt sayısı orta düzeydeyse bu bulgu acil değildir.

## P2 — İlk kayıtlar ekranı yükleme maliyeti

Kayıtlar hook’u ilk çağrıda kayıt listesinin yanında motor ve bakım türü referanslarını da yükler. Referanslar bir kez tutulduğu için sonraki filtre isteklerinde tekrar yüklenmemeleri olumlu bir optimizasyondur. Buna rağmen ilk ekran için üç ayrı response beklenir.

İyileştirme seçenekleri şunlardır:

- Motor ve bakım türü listelerini ortak `cachedFetch` üzerinden paylaşmak.
- Referansları layout veya üst seviye provider’da önceden yüklemek.
- Kayıt API’sinin küçük filtre seçeneklerini response içinde taşıması.

Bu seçenekler network waterfall ölçülmeden uygulanmamalıdır. Referans payload’ları küçükse değişiklik beklenen faydayı sağlamayabilir.

## P2 — QR üretiminde main-thread yükü

QR Etiketleri sayfası tüm `items` dizisi için `QRCode.toDataURL` çağrılarını `Promise.all` ile başlatıyor. Bu, network paralelliği değil, tarayıcı içinde CPU ve canvas/string üretiminin aynı anda başlatılmasıdır. Motor sayısı azsa sorun değildir; yüzlerce etiket olduğunda ilk etkileşim veya yazdırma öncesi bekleme uzayabilir.

Ölçüm sonucu sorun doğrulanırsa QR üretimi 10–20 öğelik batch’lere bölünebilir veya yalnızca görünür/seçili öğeler için üretilebilir. Yazdırma davranışı korunacaksa tüm seçili etiketlerin hazır olduğuna dair açık bir durum gösterilmelidir.

## P3 — Bundle ve client CPU gözlemleri

Son production build çıktısında `.next/static` yaklaşık **3,3 MB**, PDF worker yaklaşık **1,4 MB** olarak ölçüldü. Bu değerler toplam build çıktısıdır; tek bir kullanıcının ilk route yükünde indirilen veri miktarı değildir. Yine de PDF worker’ın ilgili ekran dışında yüklenip yüklenmediği Network waterfall üzerinden doğrulanmalıdır.

Dashboard’da `healthRows` hesaplaması her motor için `items.filter(...)` ve ardından tekrar `filter`/`reduce` çalıştırıyor. Normal veri hacminde bu kabul edilebilir. Ancak motor ve bakım türü sayısı arttığında önce `engine_id` ile gruplanmış bir `Map` oluşturmak client CPU maliyetini tek geçişe yaklaştırabilir.

Bu iki P3 bulgusu için önce Chrome Performance trace ve route-level bundle analizi gerekir. Kanıt olmadan `useMemo`, `React.memo` veya dynamic import eklemek kod karmaşıklığını artırabilir.

## Ölçüm planı

| Aşama | Ölçüm | Kabul kriteri |
|---|---|---|
| 1 | Staging’de `/api/records` baseline ve arama p50/p95 | Tüm beklenen yanıtlar 200; timeout yok |
| 2 | Aynı terimlerde `client_ms` ve `server_timing_ms` karşılaştırması | Network/runtime ile route/DB etkisi ayrıştırılmış |
| 3 | MongoDB `explain("executionStats")` | `totalDocsExamined`, execution time ve winning plan kaydedilmiş |
| 4 | Kayıtlar ekranında hızlı filtre Performance trace | Eski yanıtın state’i ezmediği ve gereksiz request’lerin iptal edildiği doğrulanmış |
| 5 | Audit log p95 ve count maliyeti | Regex ve count etkisi ayrı raporlanmış |
| 6 | Değişiklik sonrası aynı testlerin tekrarı | Aynı veri, aynı round, aynı koşul; p50/p95 karşılaştırması |

Staging kimlik bilgileri ve session cookie bu inceleme sırasında mevcut olmadığı için adım 1–3 canlı veriyle çalıştırılmadı. Production’a load test uygulanmamalıdır.

## Önerilen uygulama sırası

İlk değişiklik olarak `useRecordsPageData` içine request seviyesinde AbortController eklenmesi önerilir. Bu değişiklik dar kapsamlıdır, kullanıcı deneyimini doğrudan iyileştirir ve backend davranışını değiştirmez.

İkinci adımda staging kayıt arama ölçümü çalıştırılmalıdır. Ölçüm regex veya count maliyetini doğrularsa, bu iki konu birbirinden ayrı PR’larda ele alınmalıdır. Birden fazla performans değişikliğini tek seferde yapmak hangi değişikliğin fayda sağladığını belirsizleştirir.

Üçüncü adım, index bootstrap’ın request path’inden ayrılmasını değerlendirmektir. Bu adım deployment ve rollback planı gerektirir; çünkü index’lerin bulunmadığı yeni ortamda sorgu davranışı değişebilir.

Dördüncü adımda cursor pagination ve audit log count stratejisi, gerçek veri hacmi ve kullanıcı davranışıyla birlikte kararlaştırılmalıdır.

## Sonuç

Projede genel performans altyapısı iyi yönde ilerlemiştir. Merkezi kayıtlar hook’una request seviyesinde AbortController desteği eklenmiş ve doğrulanmıştır. Sıradaki değerli çalışma staging’de arama/count ölçümlerini almaktır. Regex araması, `countDocuments`, offset pagination ve index bootstrap gerçek verilerle ölçülmeden büyük bir veritabanı yeniden tasarımına gidilmemelidir.

## References

[1]: https://github.com/yalcinsahin55/agm-bakim-nextjs/blob/main/app/kayitlar/_hooks/useRecordsPageData.ts "AGM Bakım kayıtlar sayfası veri hook’u"

[2]: https://github.com/yalcinsahin55/agm-bakim-nextjs/blob/main/app/api/records/_lib/recordsQuery.ts "AGM Bakım kayıt sorgusu"

[3]: https://github.com/yalcinsahin55/agm-bakim-nextjs/blob/main/app/api/audit-logs/route.ts "AGM Bakım audit log API route"

[4]: https://github.com/yalcinsahin55/agm-bakim-nextjs/blob/main/lib/dbIndexes.ts "AGM Bakım MongoDB index bootstrap tanımları"

[5]: https://github.com/yalcinsahin55/agm-bakim-nextjs/blob/main/docs/staging-performance-measurement.md "AGM Bakım staging performans ölçüm runbook’u"

[6]: https://github.com/yalcinsahin55/agm-bakim-nextjs/blob/main/lib/performance.ts "AGM Bakım API ve DB timing gözlemlenebilirliği"
