# AGM Bakım — Observability Runbook’u

## Uygulanan temel katman

API ve iç DB işlemleri privacy-safe structured log üretir. Log satırları `[api-observability]` önekiyle başlar ve JSON içinde olay adı, zaman, request ID, route/operation, HTTP status, süre ve sınırlı hata kodu bulunur. Request header/body, cookie, parola, token, medya byte’ı ve sorgu parametreleri loglanmaz.

`withApiTiming` yavaş istekleri, 4xx/5xx sonuçlarını ve unhandled exception’ları request ID ile görünür kılar. `withDbTiming` yavaş veya başarısız DB/cache işlemlerini aynı request ID’ye bağlar. İsteğe bağlı `API_OBSERVABILITY_LOG_ALL=true` değişkeni tüm API/DB timing kayıtlarını açar; production’da yalnızca kısa süreli tanı sürecinde kullanılmalıdır.

## Index ve cron görünürlüğü

`ensureAppIndexes` her index sonucunu takip eder. Başarısız index kurulumları `db_index_error` ve toplu durum `db_index_bootstrap_degraded` olaylarıyla loglanır; başarılı bootstrap `db_index_bootstrap_ready` olarak görünür. Yetkili `GET /api/health/mongodb` çağrısı Mongo ping sonucuna ek olarak index durumunu döndürür. Index durumu `degraded` ise endpoint `503` döner. Anonim health çağrısının response sözleşmesi değişmez ve `401 {"ok":false,"error":"unauthorized"}` olarak kalır.

Cron bildirim yenileme endpoint’i başarıda `cron_refresh_succeeded`, hatada `cron_refresh_failed` olayı üretir. Başarı/hatada kullanıcı sayısı, actionable item sayısı, süre ve sınırlı hata adı dışında hassas veri yazılmaz. Endpoint `CRON_SECRET` ile korunur ve `Cache-Control: no-store` döndürür.

## Operasyon kontrolü

Production’da yetkili health kontrolü, uptime sağlayıcısının Bearer `CRON_SECRET` ile `GET /api/health/mongodb` çağırması şeklinde yapılandırılabilir. Beklenen başarılı yanıt HTTP `200`, `ok: true`, `status: "healthy"` ve `indexes.state: "ready"` değerleridir. Mongo ping veya kritik index bootstrap başarısızlığında HTTP `503` beklenir. Secret veya yetkili uptime hesabı olmayan ortamlarda production isteği gönderilmemelidir.

## Harici hata izleme sınırı

Bu sürümde sahte bir Sentry/Better Stack credential’ı eklenmemiştir. Harici entegrasyon için gerçek servis hesabı, DSN/API anahtarı, retention ve kişisel veri redaction politikası gerekir. Bu bilgiler sağlandığında server-only error transport, request ID korelasyonu, cron/index event route’lama ve alert eşikleri ayrı bir PR’da eklenmelidir. Mevcut structured log katmanı bu entegrasyon için güvenli olay kaynağıdır; uygulama çalışması harici izleme servisinin erişilebilirliğine bağlanmaz.
