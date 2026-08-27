# Private Blob Preview Pilot Runbook’u

Bu pilot, mevcut public Blob nesnelerini dönüştürmeden yalnızca yeni hassas rapor ve yağ analizi dosyalarını Vercel’in mevcut private `agm-bakim-media-2` store’una almayı amaçlar. Pilot, `private-pilot/` prefix’i kullanır; mevcut `report-attachments/`, `oil-analyses/`, `photos/`, `videos/`, `legacy-media/` ve public URL kayıtları değiştirilmez.

## Vercel bağlantısı

AGM projesi mevcut private `agm-bakim-media-2` store’una Preview ve Production ortamlarında OIDC ile bağlıdır. Uygulama bağlantısında `MEDIA_STORE_ID`, `MEDIA_READ_WRITE_TOKEN` ve `MEDIA_WEBHOOK_PUBLIC_KEY` değişkenleri görünür; değerler source code’a veya loglara yazılmaz. Private store ID’si açıkça `PRIVATE_BLOB_STORE_ID` ile override edilebilir, ancak varsayılan pilot store `MEDIA_STORE_ID`’dir.

## Feature flag

```text
PRIVATE_BLOB_PILOT_ENABLED=true
```

Bu flag yalnızca `VERCEL_ENV=preview` olduğunda etkili olur. Production’da flag `true` olsa bile helper private pilotu kapatır. Flag unset/false olduğunda upload-server’ın mevcut public davranışı ve mevcut pathname’leri aynen korunur.

Pilot yalnızca `report-attachments` ve `oil-analyses` klasörlerinde çalışır. Fotoğraf, video ve offline upload’lar bu PR’da private’a çevrilmez; böylece büyük saha medyasının Function proxy maliyeti ve cihaz performansı ölçülmeden toplu geçiş yapılmaz.

## Upload davranışı

Authenticated kullanıcı ve mevcut role/rate-limit/content-type/size kontrolleri upload’dan önce çalışmaya devam eder. Preview flag aktifken rapor ve yağ analizi upload’larının path’i aşağıdaki biçime namespacelenir:

```text
private-pilot/report-attachments/<safe-file-name>
private-pilot/oil-analyses/<safe-file-name>
```

SDK’ye `access: "private"` ve private store ID gönderilir. Vercel Preview’da store bağlantısının OIDC’si kullanılır; local/non-Vercel çalıştırmalarda yalnızca açıkça sağlanan `MEDIA_READ_WRITE_TOKEN` veya `BLOB_READ_WRITE_TOKEN` kullanılır. Private store ID/token yoksa uygulama yanlışlıkla public default store’a fallback yapmaz, 503 ve `PRIVATE_BLOB_PILOT_CREDENTIALS_UNAVAILABLE` döndürür.

## Okuma ve UI

Rapor ekleri mevcut authenticated `/api/records/{id}/attachments/{attachmentId}` proxy’sinden okunur; PDF response’larında `private, no-store`, MIME doğrulaması ve PDF signature kontrolü korunur. Fotoğraf/video UI’ı private Blob hostlarını mevcut `/api/media/file` proxy’sine dönüştürür; bu pilot fotoğraf/video upload yolunu aktif etmediği için yalnızca gelecekteki geçiş için hazır durumdadır.

Bir private URL bilen anonim kullanıcı doğrudan Blob URL’sinden okuyamamalıdır. Uygulama proxy’si ayrıca URL’nin ilgili bakım kaydında referans edildiğini kontrol eder ve authenticated kullanıcı şartını korur.

## Preview kabul testi

Aşağıdaki testler staging/Preview ortamında, minimum yetkili bir test hesabıyla yürütülür:

1. `PRIVATE_BLOB_PILOT_ENABLED=true` yalnızca Preview environment’ına eklenir ve yeni deployment alınır.
2. Yönetici test hesabıyla küçük bir PDF veya yağ analizi PDF’i yüklenir.
3. Dönen URL hostunun `.private.blob.vercel-storage.com` olduğu ve pathname’in `private-pilot/` ile başladığı doğrulanır.
4. URL anonim bir tarayıcı isteğiyle açılmaya çalışılır; private Blob’un public okunamadığı doğrulanır.
5. Aynı dosya uygulama içindeki authenticated attachment proxy ile açılır; PDF signature, `Content-Type`, `Content-Disposition` ve `Cache-Control: private, no-store` doğrulanır.
6. Aynı akışta mevcut public bir attachment açılarak geriye dönük davranış karşılaştırılır.
7. Offline report upload ve mevcut fotoğraf/video upload’larının flag kapalı davranışıyla aynı kaldığı doğrulanır.
8. Preview runtime loglarında token veya hassas URL query değerleri aranır; token loglanmamalıdır.

Pilot gerçek bir Preview test hesabı ve authenticated session olmadan tamamlanmış sayılmaz. CI unit/contract testleri yalnızca policy ve namespace güvenliğini kanıtlar; Blob servis round-trip kanıtı değildir.

## Rollback

Pilot sorunu görülürse önce Preview environment’ındaki `PRIVATE_BLOB_PILOT_ENABLED` false/unset yapılır ve yeni Preview deployment alınır. Böylece yeni upload’lar mevcut public yolu kullanır; eski public nesneler etkilenmez. Pilot sırasında oluşturulan private nesneler silinmeden önce DB referansları ve kullanıcı etkisi incelenir. Production flag’i zaten helper tarafından etkisizleştirildiği için bu pilot PR’ı production public upload davranışını kendiliğinden değiştirmez.

Private store credential rotation veya revoke işlemi bu pilotun parçası değildir. Vercel ekranındaki OIDC bağlantısı nedeniyle token revoke ancak bağlı deployment’lar redeploy edildikten ve Vercel dışı kullanım olmadığı ayrıca doğrulandıktan sonra, ayrı ve kullanıcı onaylı bir işlem olarak ele alınabilir.
