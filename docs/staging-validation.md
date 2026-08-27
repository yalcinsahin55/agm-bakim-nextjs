# AGM Bakım — Staging ve Son Kullanıcı Doğrulama Runbook’u

Bu belge, production verisini değiştirmeden kalan kalite işlerini doğrulamak için hazırlanmıştır. `npm run smoke:readonly` yalnızca GET istekleri gönderir. Restore, kayıt oluşturma/düzenleme/silme, dosya yükleme ve offline retry adımları yalnızca ayrı bir staging veritabanında, yönetici onayıyla ve test verileriyle çalıştırılmalıdır.

## 1. Read-only smoke

Staging URL’si ve test oturumu dışarıdan sağlanır; session cookie hiçbir zaman loglanmamalıdır. Komut cookie’yi yalnızca geçici environment variable’dan okur ve çıktıya yazmaz:

```bash
SMOKE_BASE_URL=https://staging.example.com \
SMOKE_COOKIE='session=STAGING_TEST_COOKIE' \
npm run smoke:readonly
```

Beklenen sonuç, sayfa GET’lerinde `200`, authenticated API GET’lerinde `200`, cookie gönderilmeyen API GET’lerinde ise `401` görülmesidir. Gerçek staging hostname’i ve test cookie’si olmadan production’a yönelik otomatik smoke çalıştırılmamalıdır.

## 2. Yetki ve API senaryoları

Aşağıdaki matris staging test hesaplarıyla doğrulanmalıdır. Bu çağrılar write içerdiğinden agent tarafından production’da çalıştırılmamıştır.

| Senaryo | Beklenen sonuç |
|---|---|
| Cookie olmadan protected GET | `401` |
| Görüntüleyici ile bakım kaydı POST/PATCH/DELETE | `403` |
| Teknisyen ile başka teknisyenin kaydını değiştirme | `403` veya ownership politikasına göre reddedilme |
| Teknisyen ile başka motorun kaydını değiştirme | `403` veya record ownership politikasına göre reddedilme |
| Teknisyenin yönetici kullanıcı endpointine erişimi | `403` |
| Yönetici ile geçerli bakım kaydı oluşturma | Başarılı; audit kaydı oluşmalı |
| Başarısız/tekrarlı `client_request_id` | İkinci çağrı duplicate olarak sonuçlanmalı; ikinci kayıt oluşmamalı |

Her testten sonra staging audit log’da kullanıcı, action, entity, entity ID ve gerekiyorsa before/after alanları kontrol edilmelidir.

## 3. Eşzamanlılık ve idempotency

Aynı staging motoru için iki ayrı yönetici hesabından aynı anda saat güncellemesi gönderilmelidir. Sonuçların deterministik olması, motor history’nin iki geçerli kaydı içermesi ve arayüzün hata vermemesi beklenir. Aynı `client_request_id` ile iki bakım create isteği gönderildiğinde unique sparse index nedeniyle yalnızca bir grup bakım kaydı oluşmalıdır.

Bir grouped maintenance isteğinde primary kayıt oluşturulduktan sonra istemci bağlantısı kesilerek retry denenmelidir. Retry’nin mevcut primary kaydı duplicate olarak tanıması, aynı media idempotency key’lerini yeniden kullanması ve ikinci bağımsız Blob nesnesi üretmemesi beklenir. İlk çağrı primary kaydı oluşturup extra türlerden önce kesilirse staging’de bu kısmi durum ayrıca incelenmelidir; tam transaction/compensation davranışı şu an ayrı bir geliştirme kararıdır.

## 4. Backup/restore round-trip

Staging’de önce yönetici hesabıyla backup export alınır ve JSON dosyası güvenli, lokal test klasöründe tutulur. Export’un v2 formatında ve `integrity.algorithm: "sha256"` alanı içerdiği; `password`, `password_hash`, token, VAPID secret ve legacy base64 dosya alanlarının bulunmadığı doğrulanır. Restore endpoint’ine `confirm: "RESTORE"`, aynı `collections` ve `integrity` ile gerçek yazma göndermeden önce `dry_run: true` gönderilir; checksum, `summary`, `skipped`, `mode: "dry-run"` ve `applied: false` kontrol edilir. Checksum eksik veya değiştirilmişse istek mutation yapmadan reddedilmelidir.

Round-trip testi için staging snapshot’ı alınmalı, test verisiyle kontrollü değişiklik yapılmalı, restore sonrası motorlar, bakım türleri, bakım kayıtları ve yağ analizleri sayıları karşılaştırılmalıdır. Restore route’u yalnızca allowlist’teki dört koleksiyona yazar; kullanıcılar, notification’lar ve audit log backup içinde olsa da restore edilmez. Production’da checksum doğrulamasından sonra restore tek MongoDB transaction içinde kontrollü merge olarak uygulanır; transaction başlatılamazsa işlem durdurulur. Preview/local/test ortamında batch merge davranışı test edilebilirlik için korunur. Production restore otomatik olarak bu runbook’tan çalıştırılmamalı; yalnızca ayrıca onaylanmış, gözlemlenebilir bir operasyon olarak yürütülmelidir.

## 5. Mobil cihaz kabul testi

Gerçek Android cihazda yönetici, teknisyen ve görüntüleyici hesaplarıyla şu akışlar sırayla test edilmelidir: login/logout; bakım kayıtları listesini açma; bakım tamamlama; tarih-saat seçme; teknisyen ve yardımcı teknisyen seçme; fotoğraf ekleme; PDF/Excel/Word rapor eki ekleme; mevcut private PDF ve fotoğrafı açma; bildirim görüntüleme; motor ve bakım türü filtreleri. QR kamera özelliği daha önce kaldırıldığı için kabul kriteri QR kamera değil, mevcut QR etiket sayfasının yazdırılabilir çıktısıdır.

Offline kabul testinde kullanıcı önce test verisiyle bir bakım formunu kuyruklar, cihazı uçak moduna alır, uygulamayı kapatıp açar, tekrar login olur, bağlantıyı geri getirir ve sync sonucunu bekler. Aynı kaydın bir kez oluştuğu, fotoğraf/video/rapor placeholder’larının gerçek URL ile değiştiği, kuyrukta hata varsa `retryCount` ve kullanıcıya gösterilen hata mesajının korunduğu doğrulanır. Bu işlem production’da yapılmamalıdır; staging hesabı ve test motoru kullanılmalıdır.

## 6. Performans ölçümü

Önce tek istek bazında `npm run smoke:readonly` süreleri kaydedilir. Daha sonra staging’de 39 motor ve production’a yakın sayıda bakım kaydıyla dashboard, records, engines, panel, unread-count ve engine report endpointleri ölçülür. Ölçümde p50/p95 süre, response status, Mongo Atlas query duration ve Vercel function duration birlikte tutulmalıdır.

Read-only route’larda önceki ölçümle karşılaştırma yapılır. `include_history=true` ana motor listesinin 250 history kaydıyla bounded kaldığı, paginated history endpointinin page size uyguladığı ve analytics/report tarih filtrelerinin modern Date kayıtlarıyla birlikte legacy string/number kayıtlarını da koruduğu kontrol edilmelidir. Gerçek yük testi production’a karşı çalıştırılmamalıdır.

## 7. Son kabul kriteri

Staging’de yetki matrisi, duplicate/idempotency, restore dry-run ve round-trip, media/PDF akışı, gerçek Android offline sync ve p95 performans ölçümü tamamlanmadan production için “tam E2E doğrulandı” ifadesi kullanılmamalıdır. Production’daki mevcut doğrulama şu an GET-only smoke kapsamındadır; write ve upload akışlarının kullanıcı kontrollü test sonucu ayrıca kaydedilmelidir.
