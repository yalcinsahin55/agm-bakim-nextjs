# AGM Bakım — Android/TWA Saha Kabul Testi

Bu runbook yalnızca ayrı bir staging deployment ve test MongoDB veritabanında uygulanmalıdır. Production’da bakım kaydı, upload, restore, offline queue veya login formu ile test yapılmaz.

## Test ön koşulları

Staging’de en az bir yönetici, bir teknisyen ve bir görüntüleyici hesabı; test motoru; en az bir bakım türü; küçük bir PDF; küçük bir fotoğraf; kısa bir video; rapor eki ve temiz bir test kaydı hazırlanır. Chrome/Android sürümü, cihaz RAM’i, uygulamanın PWA/TWA kurulum biçimi ve test zamanı kaydedilir. Gerçek session cookie, parola ve dosya içeriği loglanmaz.

## Kabul matrisi

| Alan | Test | Beklenen sonuç |
|---|---|---|
| Auth | Login, logout, yeniden login | Doğru role göre menü görünür; logout sonrası eski authenticated sayfa cache’ten gelmez |
| Bakım formu | Motor, bakım türü, saat ve kontrol listesi seçimi | Alanlar taşma yapmadan açılır; gönderim sonrası kayıt bir kez oluşur |
| Süre | Sorumlu/destek teknisyende `2 saat + 30 dakika` | API’ye 150 tam dakika gider; ondalık saat dönüşümü kullanılmaz |
| Fotoğraf | Fotoğraf seç, yükle, kaydı aç | Preview görünür; kayıt detayında aynı dosya authenticated proxy üzerinden açılır |
| Video | Kısa video yükle ve detayda aç | Chunk upload tamamlanır; video URL’si kayda bağlanır; ikinci retry duplicate üretmez |
| PDF/Office | PDF, Excel, Word eki yükle/aç/indir | MIME, dosya adı ve authenticated attachment route korunur; PDF uygulama içi açılır |
| Offline | Uçak modu → bakım kaydı kuyruğa alma → uygulamayı kapat/aç → login → online | Sadece aynı owner job’ı sync olur; başka kullanıcı owner’ı reddedilir; kayıt bir kez oluşur |
| Offline medya | Offline fotoğraf/video/rapor placeholder’ı ile kuyruk | Online sonrası placeholder gerçek URL ile değiştirilir; hata durumunda retry sayısı ve mesaj korunur |
| Lifecycle | Yükleme %50–70 iken ekranı kilitle/aç veya uygulamadan çık/geri dön | Uygulama kilitlenmez; desteklenen retry/resume davranışı gözlenir; sessiz veri kaybı yoktur |
| Cache | A login → sayfaları aç → logout → B login veya offline açılış | A’nın authenticated document/RSC içeriği B’ye gösterilmez; public shell çalışır |
| Rol | Teknisyen/görüntüleyici aynı sayfalara gider | API tarafındaki RBAC korunur; yalnızca izinli aksiyonlar görünür ve çalışır |
| Bildirim | Staging cron veya manuel test refresh | Başarı/hatada structured log’da request ID ve sınırlı olay bilgisi bulunur |

## Video özel kontrolü

100 MB sınırı tek başına yeterli kabul edilmemelidir. 720p kısa video, yaklaşık 50–100 MB video ve cihaz depolamasını zorlayan senaryolar ayrı ayrı denenmelidir. 4K veya uzun videonun cihazı zorladığı gözlenirse uygulama davranışı kaydedilmeli; ürün kararı verilmeden yeni otomatik süre/çözünürlük limiti eklenmemelidir.

## Raporlama

Her satır için cihaz, OS/Chrome, staging commit SHA, başlangıç-bitiş zamanı, sonuç ve görülen request ID kaydedilir. Başarısız testte dosya veya parola rapora eklenmez. Test üretim verisine karşı yürütülmemişse raporda açıkça “production dışı staging kabul testi” yazılır.

## Bu çalışma alanındaki sınır

Bu sandbox’ta fiziksel Android cihaz, TWA kurulumu ve ayrı staging hesabı bulunmadığından yukarıdaki saha adımları burada “başarılı” olarak işaretlenmemiştir. CI Browser E2E ve local contract testleri ayrı kanıttır; gerçek cihaz kabulünün yerine geçmez. Kullanıcı staging URL’si ve test hesabıyla bu runbook’u uyguladığında sonuçlar ayrıca kaydedilmelidir.
