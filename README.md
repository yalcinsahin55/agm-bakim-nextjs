# Avcıkoru Santrali Motor Bakım Merkezi

Avcıkoru Santrali’ndeki motorların periyodik bakım, çalışma saati, teknik ölçüm ve bakım geçmişini takip etmek için geliştirilmiş mobil öncelikli bir web uygulamasıdır. Uygulama telefon, tablet ve masaüstü bilgisayarlarda çalışır; PWA yaklaşımı, çevrimdışı kayıt kuyruğu, rol tabanlı yetkilendirme, medya kanıtı ve raporlama özelliklerini tek bir bakım merkezinde birleştirir.

**Üretim adresi:** [agm-bakim-nextjs.vercel.app](https://agm-bakim-nextjs.vercel.app)

> Bu proje şirket içi kullanım için hazırlanmıştır. Kaynak kodu özel bir işletme uygulamasına aittir ve üretim ortamında kullanılan gizli değişkenler depoya gönderilmemelidir.

## İçindekiler

- [Öne çıkan özellikler](#öne-çıkan-özellikler)
- [Kullanıcı rolleri](#kullanıcı-rolleri)
- [Bakım kaydı iş akışı](#bakım-kaydı-iş-akışı)
- [Tarih-saat ve süre takibi](#tarih-saat-ve-süre-takibi)
- [Ekip teknisyenleri ve dış hizmet bakımları](#ekip-teknisyenleri-ve-dış-hizmet-bakımları)
- [QR kod ile hızlı bakım başlatma](#qr-kod-ile-hızlı-bakım-başlatma)
- [Raporlama ve dışa aktarma](#raporlama-ve-dışa-aktarma)
- [Çevrimdışı çalışma](#çevrimdışı-çalışma)
- [Medya depolama](#medya-depolama)
- [Teknoloji ve proje yapısı](#teknoloji-ve-proje-yapısı)
- [Yerel kurulum](#yerel-kurulum)
- [Environment değişkenleri](#environment-değişkenleri)
- [Vercel deployment](#vercel-deployment)
- [Bildirimler ve otomatik yenileme](#bildirimler-ve-otomatik-yenileme)
- [Yedekleme ve veri güvenliği](#yedekleme-ve-veri-güvenliği)
- [Geliştirme ve doğrulama komutları](#geliştirme-ve-doğrulama-komutları)
- [Bakım Asistanı sesli giriş ve hızlı dışa aktarma](#bakım-asistanı-sesli-giriş-ve-hızlı-dışa-aktarma)
- [Lisans](#lisans)

## Öne çıkan özellikler

| Alan | Özellikler |
|---|---|
| Motor yönetimi | Motor listesi, çalışma saati, yük bilgisi, saat geçmişi ve motor bazlı bakım durumu |
| Bakım kayıtları | Bakım türü, motor saati, not, kontrol listesi, fotoğraf/video kanıtı ve bakım geçmişi |
| Zaman takibi | Başlangıç ve bitiş için tam tarih+saat, çok günlü/haftalık bakım desteği ve otomatik toplam süre hesabı |
| Ekip çalışması | Sorumlu teknisyen ile bakımda çalışan diğer teknisyenlerin ayrı tutulması |
| Dış servis | Garanti veya harici servis bakımlarının yönetici tarafından kaydedilmesi; bu kayıtların teknisyen performansından ayrılması |
| QR workflow | Motor QR’ı, bakım türü QR’ı ve motor + bakım türü bağlantılarıyla mobil hızlı seçim |
| Raporlama | Teknisyen performans raporu, motor bakım raporu, istatistikler, bakım türü ve motor dağılımları |
| Bakım Asistanı | Salt okunur doğal dil raporu; tarih, teknisyen, bakım ve motor sorguları; kayıt oluşturma, düzenleme ve silme yetkisi yoktur |
| Dışa aktarma | Bakım geçmişinin Excel ve PDF olarak alınması; tarih, başlangıç, bitiş ve toplam süre sütunları |
| Teknik modüller | Yağ analizleri, karter fark basıncı, bakım periyotları, tahmini bakım ve takvim |
| Bildirimler | Uygulama içi bildirimler ve isteğe bağlı Web Push bildirimleri |
| Operasyon güvenliği | Rol tabanlı erişim, audit log, rate limit, Zod doğrulaması, çevrimdışı kuyruk ve yedekleme |

## Kullanıcı rolleri

Yeni kullanıcı hesaplarını yalnızca yönetici oluşturur ve onaylar. Kullanıcı hesabı aktif ve onaylı değilse uygulamanın korumalı bölümlerine erişemez.

| Rol | Yetki özeti |
|---|---|
| `yonetici` | Tüm modüllere erişir; kullanıcı ekler/onaylar, motor ve bakım türlerini yönetir, bakım tamamlarken sorumlu/yetkili bakımcıyı seçer, tüm kayıtları düzenler/siler, sorumlu teknisyeni değiştirir, dış hizmet kaydı girer ve audit kayıtlarını inceler. |
| `teknisyen` | Bakım tamamlar, dashboard ve analiz ekranlarını kullanır, bakım kayıtlarını görüntüler. Düzenleme ve silme yetkisi yalnızca birincil/sorumlu teknisyen olarak kendisinin oluşturduğu kayıtlar içindir. Yardımcı teknisyen olmak tek başına düzenleme yetkisi vermez. |
| `goruntuleyici` | Dashboard, motorlar, bakım kayıtları, analiz ve takip, bilgi/rapor, bakım türleri ve tahmin modüllerini görüntüler; kayıt üzerinde değişiklik yapamaz. |
| `planlamaci` | Eski hesaplarla geriye dönük uyumluluk için teknisyen davranışıyla değerlendirilir. Yeni kullanıcı arayüzünde ayrı bir planlamacı akışı bulunmaz. |

Yetkilendirme iki katmanda uygulanır: menü ve sayfa görünürlüğü istemci tarafında, veri okuma/yazma ve kayıt sahipliği ise API tarafında kontrol edilir. İstemci arayüzünün değiştirilmesi API yetkilerini aşmaya yetmez.

## Bakım kaydı iş akışı

1. Kullanıcı motoru ve bakım türünü seçer. QR bağlantısı kullanılmışsa bu seçimlerden biri veya ikisi otomatik doldurulabilir.
2. Motor çalışma saati girilir. Birincil bakım türünün yanı sıra aynı işlemde tamamlanan ek bakım türleri seçilebilir.
3. Yeni kayıtlar için bakım başlangıç ve bitiş tarih+saatleri girilir. Bitiş zamanı başlangıçtan önce olamaz.
4. Kontrol listesindeki tüm maddeler tamamlanır. Yeni bakım kaydının geçerli olması için not, fotoğraf veya video kanıtlarından en az biri eklenir.
5. Bakımda çalışan diğer teknisyenler seçilir. Bu kişiler sorumlu teknisyenden ayrı tutulur. Yönetici bakım tamamlıyorsa sorumlu/yetkili bakımcıyı ayrıca seçebilir; bu alan teknisyenlere açılmaz.
6. Kayıt çevrimiçiyse API’ye gönderilir; bağlantı yoksa IndexedDB kuyruğuna alınır ve bağlantı geri geldiğinde senkronize edilir.
7. Sunucu tarafı motoru, bakım türünü, kanıtları, teknisyenleri ve zaman alanlarını doğrular; bakım süresini kendisi hesaplayarak kaydeder.

Eski kayıtlar ve eski çevrimdışı payload’lar geriye dönük uyumluluk için korunur. Yeni kullanıcı arayüzü `time_tracking_version: 2` gönderdiği için yeni kayıtlar tam tarih+saat zorunluluğuna tabidir.

## Tarih-saat ve süre takibi

Bakım süresi yalnızca saat olarak değil, tam tarih+saat aralığı olarak tutulur. Bu nedenle gece yarısını aşan, birkaç gün süren veya haftalık bakımlar desteklenir.

- `maintenance_start_at`: Bakım başlangıç zamanı.
- `maintenance_end_at`: Bakım bitiş zamanı.
- `maintenance_duration_minutes`: API tarafından başlangıç ve bitiş arasından hesaplanan toplam dakika.
- `record_date`: İşletme tarihi/backdate amacıyla ayrıca tutulabilir; bu alan bakım başlangıç tarihinden bağımsız olarak geriye dönük kayıt ihtiyacını destekler.

Tarih+saat değerleri API ve veritabanı katmanında UTC tabanlı saklanır; kullanıcı arayüzünde cihazın yerel saat dilimine çevrilerek gösterilir. Böylece telefon ve bilgisayar arasında saat kayması azaltılır.

## Ekip teknisyenleri ve dış hizmet bakımları

Bir bakımın birincil sorumlu teknisyeni ile destek olan diğer teknisyenler ayrı alanlarda tutulur. Teknisyen performans raporu sorumlu ve destek görevlerini birlikte gösterir. Ekip bakımındaki aynı bakım süresi, o bakımda seçilen her teknisyenin katkı süresine yansıtılır.

### Dış hizmet veya garanti bakımı

Garanti kapsamındaki motor bakımları veya santral dışından gelen servislerin yaptığı işler için yönetici, **Bakım Tamamla → Sorumlu kaynağı → Dış Hizmet / Harici Servis** seçimini kullanır. İsteğe bağlı olarak servis ya da firma adı yazılabilir.

Dış hizmet kaydı:

- Kayıtlı bir teknisyen hesabına bağlanmaz.
- Kayıtlı yardımcı teknisyen listesiyle birlikte tutulmaz.
- Teknisyen performans, görev ve katkı süresi metriklerine dahil edilmez.
- Bakım geçmişinde, motor raporlarında ve bakım türü/motor dağılımlarında görünmeye devam eder.
- Yalnızca yönetici tarafından oluşturulabilir veya düzenlenebilir.

Bu ayrım, dış servis tarafından yapılan gerçek bakımların kaybolmasını engellerken kayıtlı teknisyenlerin performans ölçümlerinin yanlış yükselmesini önler.

## QR kod ile hızlı bakım başlatma

QR etiketleri telefonun yerleşik kamerasıyla okutulduğunda uygulamanın bakım tamamlama bağlantısını açar; ayrı bir ücretli QR tarama servisi veya zorunlu harici uygulama kullanılmaz.

`QR Etiketleri` ekranında aşağıdaki seçenekler hazırlanabilir:

| QR türü | Tarama sonrası davranış |
|---|---|
| Motor QR’ı | Motor otomatik seçilir; teknisyen bakım türünü seçer. |
| Bakım türü QR’ı | Bakım türü otomatik seçilir; motor seçimi açık kalır. |
| Motor + bakım türü QR’ı | Hem motor hem bakım türü otomatik seçilir. |

Mevcut motor QR bağlantıları korunur. Yeni bağlantılar örneğin `/tamamla?engine_id=<id>&type_key=<key>&mode=quick&plant_id=avcikoru` biçiminde oluşturulabilir. Etiketler tekil önizlenebilir, bağlantı kopyalanabilir ve yazdırılabilir/PDF olarak alınabilir.

## Raporlama ve dışa aktarma

### Bakım Asistanı

`/asistan` ekranı, AGM Bakım verileri hakkında salt okunur sorulara cevap verir. Bakım özeti, gecikmiş bakımlar, motor bakım geçmişi, dış hizmet kayıtları ve teknisyen performansı sorgulanabilir. Tarih ifadeleri `23.08.2026`, `2026-08-23`, `5 Ağustos 2026`, `Ağustos 2026`, `01.08.2026 - 15.08.2026`, `bu hafta` ve `geçen ay` gibi biçimlerde çözümlenir. Kullanıcı belirli bir teknisyenin hangi bakım türlerinde veya motorlarda sorumlu/yardımcı olarak çalıştığını; ayrıca belirli dönemde en çok görev alan teknisyeni sorabilir. Birleşik sorgularda motor, bakım türü, iç ekip/dış hizmet, sorumluluk rolü, ekip çalışması, fotoğraf/video/not/kontrol listesi kanıtı, motor çalışma saati, bakım süresi ve mevcut bakım durumu birlikte kullanılabilir. Asistan yalnızca önceden tanımlı okuma araçlarını çağırır; doğrudan MongoDB sorgusu çalıştırmaz ve hiçbir kayıt üzerinde yazma işlemi yapamaz.

`lib/assistantPolicy.ts` soru uzunluğu, prompt injection, yazma talebi, hassas bilgi ve kesin arıza teşhisi isteklerini filtreler. Tarih aralığı policy katmanında doğrulanır; tarih bazlı özel sorgularda bakım başlangıç tarihi, eski kayıtlarda ise geriye dönük uyumluluk için oluşturulma tarihi kullanılır. Motor saati ve bakım süresi aralıkları, kanıt türü, ekip, kaynak, rol ve durum filtreleri policy çıktısına aktarılır. `/api/assistant` oturum, rol, rate limit ve içerik boyutu kontrollerinden sonra yalnızca rapor verilerini döndürür. Ham medya, base64 içerik, şifre, token ve gereksiz kişisel bilgiler asistan cevabına aktarılmaz.

### Teknisyen raporu

`/teknisyen-raporu` ekranı seçilen döneme göre aşağıdaki metrikleri sunar:

- Bu ay, son 3 ay, bu yıl ve tüm kayıtlar filtreleri.
- Toplam bakım kaydı ve teknisyen görevi.
- Sorumlu ve destek görevleri.
- Toplam teknisyen katkı süresi ve görev başına ortalama süre.
- Teknisyen bazında bakım türü ve motor dağılımları.
- Süre bilgisi bulunmayan eski kayıtlar için uyumluluk uyarısı.

Ekip bakımında bir işin süresi katılımcı teknisyenlerin katkısına ayrı ayrı yazılır. Dış hizmet kayıtları bu rapora dahil edilmez.

### Motor raporu ve istatistikler

Motor bazlı rapor; bakım türünü, motor saatini, sorumlu ve ekip teknisyenlerini, başlangıç/bitiş tarih+saatlerini ve toplam süreyi gösterir. Dashboard ve istatistik ekranları bakım sayısı, dönem ve motor durumlarını özetler.

### Excel ve PDF

Bakım geçmişi Excel ve PDF olarak dışa aktarılabilir. Dışa aktarımlarda motor, bakım türü, bakım tarihi, motor saati, başlangıç, bitiş, toplam süre, sorumlu teknisyen ve ekip teknisyenleri birlikte sunulur. PDF raporu yeni zaman sütunlarını A4 sayfa genişliğine sığdırılmış dengeli kolonlarla gösterir.

## Bakım Asistanı sesli giriş ve hızlı dışa aktarma

Asistan ekranındaki mikrofon düğmesi, destekleyen mobil ve masaüstü tarayıcılarda `SpeechRecognition` ile Türkçe konuşmayı soru kutusuna çevirir. Dinleme, mikrofon izni ve hata durumları ekranda görünür; ses metne dönüştürüldükten sonra otomatik gönderilmez ve kullanıcı metni kontrol edip düzenleyebilir. Tarayıcı desteklemiyorsa normal metin kutusu çalışmaya devam eder; mobil kullanıcılar cihaz klavyesinin mikrofonunu da kullanabilir. AGM Bakım ses kaydı yüklemez veya saklamaz.

Asistan cevaplarının uygun olduğu yerlerde **PDF indir** ve **Excel indir** düğmeleri görünür. Bu düğmeler cevabın dönem, motor, teknisyen veya dış hizmet filtresini mevcut `/api/export/pdf` ve `/api/export/excel` endpointlerine taşır. Export işlemi de normal oturum ve rol kontrollerinden geçer; dış hizmet kayıtları için `source=external_service`, teknisyen raporu için `technician_id` filtresi kullanılabilir.

Dashboard’da gecikmiş bakım uyarısının hemen altında, sayfadan ayrılmadan soru yazılabilen **Bakım Asistanı** kutusu bulunur. Tarih ve teknisyen sorguları da aynı salt-okunur endpoint üzerinden cevaplanır. Özet cevabındaki **motor dağılımı** satırlarına dokunulduğunda ilgili motorun bakım geçmişi ve bakım türleri açılır; **bakım türü dağılımı** satırına dokunulduğunda o türün yapıldığı motorlar gösterilir. Drill-down sorusu ilk cevabın tarih, kaynak, kanıt ve ekip bağlamını mümkün olduğunca korur. Kutudaki hızlı sorular doğrudan aynı alanda yanıtlanır; ayrıca detaylı cevabı açan bağlantı soruyu yeniden yazmayı veya tekrar gönder düğmesine basmayı gerektirmez. Hızlı örnekler gerçek bir motor numarası varsaymaz ve dış hizmet sorusu “Dış servisten hizmet alınan motorlar ve bakımlar hangileri?” biçimindedir. Bu alan yalnızca hızlı erişim sağlar; asistanın salt okunur policy sınırlarını değiştirmez.

## Çevrimdışı çalışma

Bakım tamamlama formu bağlantı olmadığında kaydı tarayıcıdaki IndexedDB kuyruğuna alır. Fotoğraf ve video gibi bekleyen medya dosyaları da aynı kuyruk akışında tutulur. İnternet geri geldiğinde senkronizasyon yapılır; `client_request_id` gibi tekrar önleyici alanlar sayesinde aynı kaydın birden fazla kez oluşturulması engellenir.

Çevrimdışı senkronizasyon sırasında:

- Mevcut kayıtlar silinmez.
- Eski payload biçimleri desteklenir.
- Yeni v2 kayıtlarında başlangıç ve bitiş tarih+saatleri korunur.
- Medya yükleme başarısızsa kayıt ve medya kuyruğu kullanıcıya bildirilmeye devam eder.

## Medya depolama

Yeni fotoğraf ve video dosyaları Vercel Blob Storage’a yüklenir; MongoDB’de büyük medya byte’ları tutulmaz. MongoDB’de dosya URL’si ve gerekli metadata saklanır. Eski kayıtlardaki base64 fotoğraf/video biçimleri geriye dönük görüntüleme için desteklenir.

Vercel Blob kurulumu için proje içinde `BLOB_STORE_ID` ve `BLOB_READ_WRITE_TOKEN` değerlerinin ilgili ortama tanımlanması gerekir. Token değerleri kaynak koda yazılmamalı ve GitHub’a gönderilmemelidir.

## Teknoloji ve proje yapısı

### Teknoloji yığını

- **Next.js 14 App Router**
- **React 18** ve **TypeScript**
- **MongoDB Atlas**
- **Tailwind CSS 3**
- **Vercel** ve Vercel Blob Storage
- **Web Push** bildirimleri
- **PDFKit** ile PDF, **SheetJS/XLSX** ile Excel üretimi
- **QRCode** ile QR görseli üretimi
- **Zod** ile API payload doğrulaması
- **JOSE** ve JWT tabanlı oturum güvenliği

### Klasör yapısı

```text
app/
├── api/                         # Auth, motor, kayıt, rapor, bildirim, asistan ve dışa aktarma API'leri
├── dashboard/                   # Ana kontrol paneli ve asistan hızlı soruları
├── tamamla/                     # Bakım tamamlama ve QR deep-link akışı
├── kayitlar/                    # Bakım listesi, detay ve düzenleme
├── motorlar/                    # Motor listesi, sağlık görünümü ve motor QR'ı
├── teknisyen-raporu/            # Teknisyen performans ve süre raporu
├── asistan/                     # Salt okunur bakım raporu asistanı
├── rapor/                       # Motor bazlı yazdırılabilir rapor
├── qr-etiketleri/               # Toplu QR etiketi üretimi
├── istatistik/                  # İstatistik özetleri
├── yag-analizleri/              # Yağ analizleri ve PDF dosyaları
├── karter-basinci/              # Karter fark basıncı kayıtları
├── araliklar/                   # Bakım periyotları
├── tahmin/                      # Tahmini bakım ekranı
├── takvim/                      # Bakım takvimi
├── audit-log/                   # İzlenebilirlik kayıtları
├── kullanicilar/                # Kullanıcı yönetimi
└── ...
components/                     # TopBar, BottomNav, Skeleton, Lightbox ve ortak UI
lib/
├── auth.ts                      # Oturum ve kullanıcı çözümleme
├── mongodb.ts                   # MongoDB bağlantısı
├── schemas.ts                   # Zod payload şemaları
├── permissions.ts               # Rol ve route yetkileri
├── technicians.ts               # Aktif teknisyen ve isim normalizasyonu
├── maintenanceTime.ts           # Tarih+saat süre hesapları
├── offlineQueue.ts              # IndexedDB çevrimdışı kayıt kuyruğu
├── maintenance.ts               # Bakım durumu ve motor güncellemeleri
├── dbIndexes.ts                 # Uygulama indeksleri
└── ...
middleware.ts                   # Route koruması ve auth yönlendirmeleri
public/                          # Manifest, ikon ve küçük statik dosyalar
vercel.json                      # Cron zamanlaması
.env.example                    # Environment değişkeni örneği
```

## Yerel kurulum

### Gereksinimler

- Node.js 18.17 veya üzeri; geliştirme için Node.js 20 LTS önerilir.
- MongoDB Atlas veya erişilebilir bir MongoDB sunucusu.
- Fotoğraf/video üretim ortamı için Vercel Blob bağlantısı.
- Web Push kullanılacaksa VAPID anahtarları.

### Kurulum adımları

```bash
git clone https://github.com/yalcinsahin55/agm-bakim-nextjs.git
cd agm-bakim-nextjs
npm install
cp .env.example .env.local
```

`.env.local` dosyasındaki değerleri doldurduktan sonra geliştirme sunucusunu başlatın:

```bash
npm run dev
```

Uygulama varsayılan olarak [http://localhost:3000](http://localhost:3000) adresinde açılır. İlk yönetici hesabının oluşturulması veya mevcut kullanıcıların yönetici tarafından eklenmesi uygulamanın auth akışına göre yapılır; üretim veritabanına seed veya test verisi göndermeden önce doğru ortam değişkenlerinin kullanıldığından emin olun.

## Environment değişkenleri

`.env.example` dosyası güvenli bir başlangıç şablonudur. Gerçek değerleri `.env.local` dosyasında veya Vercel **Settings → Environment Variables** bölümünde tanımlayın.

| Değişken | Gerekli kullanım | Açıklama |
|---|---|---|
| `MONGO_URI` | Evet | MongoDB bağlantı adresi. Kullanıcı adı ve şifreyi içerdiği için gizli tutulmalıdır. |
| `MONGO_DB_NAME` | Evet | Uygulamanın kullanacağı veritabanı adı. |
| `JWT_SECRET` | Evet | Oturum imzalama için uzun ve rastgele gizli değer. |
| `BLOB_STORE_ID` | Medya için | Vercel Blob store kimliği. |
| `BLOB_READ_WRITE_TOKEN` | Medya için | Blob okuma/yazma token’ı; yalnızca sunucu ortamında tutulmalıdır. |
| `MEDIA_READ_WRITE_TOKEN` | Alternatif medya bağlantısı | Alternatif Blob kurulumunda kullanılabilir. |
| `MEDIA_STORE_ID` | Alternatif medya bağlantısı | Alternatif medya store kimliği. |
| `MEDIA_WEBHOOK_PUBLIC_KEY` | Alternatif medya bağlantısı | Medya webhook doğrulama anahtarı. |
| `VAPID_SUBJECT` | Web Push için | Genellikle `mailto:admin@example.com` biçiminde iletişim adresi. |
| `VAPID_PUBLIC_KEY` | Web Push için | İstemci tarafında abonelik oluşturmak için kullanılan public anahtar. |
| `VAPID_PRIVATE_KEY` | Web Push için | Yalnızca sunucuda tutulması gereken private anahtar. |
| `CRON_SECRET` | Cron için | `/api/cron/refresh` endpoint’ini koruyan gizli değer. |

Web Push anahtarlarını üretmek için:

```bash
npx web-push generate-vapid-keys
```

`.env`, `.env.local` ve gerçek token/secret değerlerini GitHub’a göndermeyin. `.gitignore` bu dosyaları dışarıda bırakacak şekilde yapılandırılmıştır; yine de commit öncesi değişen dosyaları kontrol edin.

## Vercel deployment

1. GitHub deposunu Vercel projesine bağlayın.
2. `MONGO_URI`, `MONGO_DB_NAME` ve `JWT_SECRET` değişkenlerini en az Production ortamında tanımlayın.
3. Medya kullanılacaksa Vercel Storage üzerinden bir Blob store oluşturun ve Blob değişkenlerini projeye bağlayın.
4. Web Push kullanılacaksa üç VAPID değişkenini, otomatik bakım bildirimleri kullanılacaksa `CRON_SECRET` değerini ekleyin.
5. GitHub’ın `main` dalına yapılan push’larda otomatik deployment başlatılır.
6. Deployment tamamlandıktan sonra Vercel’de durumun **Ready** olduğunu, Production domain’in doğru olduğunu ve login sayfasının açıldığını kontrol edin.

Vercel’de Preview, Production ve gerekiyorsa Development ortamlarına farklı veritabanı veya Blob değerleri tanımlanması önerilir. Yerel build sırasında üretim veritabanına yazmamak için ayrı bir test veritabanı kullanın.

## Bildirimler ve otomatik yenileme

Web Push isteğe bağlıdır. Kullanıcı, Bildirimler ekranından tarayıcı bildirim izni verdiğinde abonelik bilgisi sunucuya kaydedilir. Bakım durumu değiştiğinde veya gecikmiş/kritik/yaklaşan bakım oluştuğunda uygun bildirimler gönderilebilir.

`vercel.json` dosyası aşağıdaki cron endpoint’ini her gün UTC 06:00’da çalıştırır:

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Cron endpoint’i `CRON_SECRET` ile korunur. Cron zamanları UTC’dir; Türkiye’de görüntülenen yerel saatle karıştırılmamalıdır. Cron yalnızca bakım durumu ve bildirim yenileme sürecini tetikler.

## Yedekleme ve veri güvenliği

Uygulama içindeki yedekleme/arsiv ekranı kullanılabilse de MongoDB Atlas tarafındaki yedekleme imkânları ayrıca değerlendirilmelidir. Yedek dosyalarını GitHub’a veya herkese açık Blob alanına koymayın.

Önerilen uygulamalar:

- Üretim veritabanı için düzenli MongoDB Atlas snapshot veya uygun yedekleme planı kullanın.
- Uygulama dışa aktarımlarını erişimi kısıtlı bir depolama alanında saklayın.
- Geri yükleme yapmadan önce mevcut veritabanı ve medya referanslarının yedeğini alın.
- `JWT_SECRET`, `MONGO_URI`, Blob token’ları, VAPID private key ve `CRON_SECRET` değerlerini paylaşmayın.
- Audit log kayıtlarını silmeden önce operasyonel ve denetim ihtiyaçlarını kontrol edin.
- Üretim verisine karşı migration veya toplu düzeltme yapmadan önce dry-run/önizleme yaklaşımı kullanın.

## Eski teknisyen kayıtlarını standardize etme

Yeni kayıtlar teknisyenleri sabit kullanıcı ID’siyle saklar. Eski kayıtlarda yalnızca görünen ad veya farklı yazım biçimleri bulunuyorsa `scripts/migrate-technician-source.mjs` yardımcı aracı kullanılabilir. Araç varsayılan olarak **dry-run** çalışır; bu modda hiçbir kayıt değiştirilmez.

Önce üretim veritabanının ayrı ve erişimi kısıtlı bir yedeğini alın. Ardından proje kök dizininde yalnızca rapor üretin:

```bash
node scripts/migrate-technician-source.mjs --report=migration-output/technician-preview.json
```

Araç şu sınıflandırmayı yapar:

| Durum | Migration davranışı |
|---|---|
| Geçerli teknisyen ID’si aktif/onaylı kullanıcıyla eşleşir | `technician_source: "internal"` ve güncel kullanıcı adı yazılır. |
| ID eşleşmez, normalize edilmiş ad tek bir aktif/onaylı kullanıcıyla eşleşir | Güvenli otomatik `internal` eşleşmesi yapılır. Büyük-küçük harf, Türkçe Unicode ve fazla boşluk farkları normalize edilir. |
| Kayıt dış hizmet sentinel’i veya mevcut dış hizmet işareti taşıyor | `external_service` ve standart dış hizmet kimliği korunur; varsa servis adı korunur. |
| Hiç eşleşme yok veya aynı normalize edilmiş ada sahip birden fazla kullanıcı var | Kayıt **değiştirilmez** ve `unresolved_samples` raporuna alınır. |

Dry-run raporunda `high_confidence_changes`, `internal_changes`, `external_service_changes`, `unchanged` ve `unresolved` sayılarını inceleyin. Belirsiz kayıtları yönetici olarak doğruladıktan sonra isteğe bağlı bir mapping dosyası oluşturabilirsiniz:

```json
{
  "records": {
    "<kayıt_id>": { "source": "internal", "technician_id": "<kullanıcı_id>" },
    "<kayıt_id>": { "source": "external_service", "external_service_name": "Garanti Servisi" }
  }
}
```

Mapping ve sınırlı apply işlemi:

```bash
node scripts/migrate-technician-source.mjs \
  --mapping=migration-output/mapping.json \
  --report=migration-output/apply-report.json \
  --backup=migration-output/technician-backup.json \
  --max-changes=1000 \
  --apply \
  --confirm=APPLY-TECHNICIAN-SOURCE-MIGRATION
```

Apply modu yalnızca yüksek güvenli otomatik eşleşmeleri ve mapping dosyasında açıkça belirtilen kayıtları uygular. Her çalıştırmada değiştirilecek teknisyen alanlarının yedeğini önce JSON dosyasına atomik olarak yazar. Varsayılan tek çalıştırma sınırı 1.000 kayıttır; bu sınırı yükseltmeden önce dry-run raporunu ve veritabanı yedeğini kontrol edin. Apply sırasında beklenmeyen bir güncelleme hatası oluşursa, o ana kadar uygulanan değişiklikler otomatik olarak backup alanlarından geri alınır; geri alma sırasında da hata olursa backup dosyası manuel rollback için korunur.

Bir hata veya yanlış eşleşme fark edilirse, apply sırasında üretilen yedekle yalnızca migration’ın takip ettiği alanları geri yükleyin:

```bash
node scripts/migrate-technician-source.mjs \
  --rollback=migration-output/technician-backup.json \
  --max-changes=1000 \
  --apply \
  --confirm=ROLLBACK-TECHNICIAN-SOURCE-MIGRATION
```

Script yalnızca `technician_source`, `technician_id`, `technician_name` ve `external_service_name` alanlarına dokunur; motor, bakım türü, tarih-saat, medya, not, kontrol listesi ve ekip teknisyeni alanlarını değiştirmez. `migration-output/` klasörü `.gitignore` içinde tutulduğu için rapor ve yedekler GitHub’a gönderilmez. Migration tamamlandıktan sonra Teknisyen Raporu’nu yenileyerek isim varyasyonlarının tek satırda birleştiğini, dış hizmet kayıtlarının ise teknisyen metriklerine dahil olmadığını kontrol edin.

## Geliştirme ve doğrulama komutları

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusunu başlatır. |
| `npm run build` | Next.js production derlemesini oluşturur. |
| `npm run start` | Production derlemesini çalıştırır. |
| `npx tsc --noEmit --pretty false` | TypeScript tip kontrolü yapar. |
| `git diff --check` | Boşluk ve patch kaynaklı diff sorunlarını kontrol eder. |

Yayın öncesi asgari doğrulama:

```bash
git diff --check
npx tsc --noEmit --pretty false
npm run build
git status --short --branch
```

Üretim doğrulamasında gerçek kayıt oluşturmadan login sayfasını, auth yönlendirmelerini, yeni rotaların açılışını ve Vercel deployment durumunu kontrol edin. Gerçek kullanıcı hesabıyla özellik testi yapılacaksa test verisinin üretim kayıtlarına karışmamasına dikkat edin.

## İlgili resmi belgeler

- [Next.js Documentation](https://nextjs.org/docs)
- [MongoDB Atlas Documentation](https://www.mongodb.com/docs/atlas/)
- [Vercel Blob Documentation](https://vercel.com/docs/vercel-blob)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Web Push Protocol](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)

## Lisans

Bu proje şirket içi kullanım için hazırlanmış özel bir yazılımdır. Tüm hakları saklıdır.

---

**Avcıkoru Santrali Motor Bakım Merkezi** · Next.js · TypeScript · MongoDB · Vercel
