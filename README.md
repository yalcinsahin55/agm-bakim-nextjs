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
| Dışa aktarma | Bakım geçmişinin Excel ve PDF olarak alınması; tarih, başlangıç, bitiş ve toplam süre sütunları |
| Teknik modüller | Yağ analizleri, karter fark basıncı, bakım periyotları, tahmini bakım ve takvim |
| Bildirimler | Uygulama içi bildirimler ve isteğe bağlı Web Push bildirimleri |
| Operasyon güvenliği | Rol tabanlı erişim, audit log, rate limit, Zod doğrulaması, çevrimdışı kuyruk ve yedekleme |

## Kullanıcı rolleri

Yeni kullanıcı hesaplarını yalnızca yönetici oluşturur ve onaylar. Kullanıcı hesabı aktif ve onaylı değilse uygulamanın korumalı bölümlerine erişemez.

| Rol | Yetki özeti |
|---|---|
| `yonetici` | Tüm modüllere erişir; kullanıcı ekler/onaylar, motor ve bakım türlerini yönetir, tüm kayıtları düzenler/siler, sorumlu teknisyeni değiştirir, dış hizmet kaydı girer ve audit kayıtlarını inceler. |
| `teknisyen` | Bakım tamamlar, dashboard ve analiz ekranlarını kullanır, bakım kayıtlarını görüntüler. Düzenleme ve silme yetkisi yalnızca birincil/sorumlu teknisyen olarak kendisinin oluşturduğu kayıtlar içindir. Yardımcı teknisyen olmak tek başına düzenleme yetkisi vermez. |
| `goruntuleyici` | Dashboard, motorlar, bakım kayıtları, analiz ve takip, bilgi/rapor, bakım türleri ve tahmin modüllerini görüntüler; kayıt üzerinde değişiklik yapamaz. |
| `planlamaci` | Eski hesaplarla geriye dönük uyumluluk için teknisyen davranışıyla değerlendirilir. Yeni kullanıcı arayüzünde ayrı bir planlamacı akışı bulunmaz. |

Yetkilendirme iki katmanda uygulanır: menü ve sayfa görünürlüğü istemci tarafında, veri okuma/yazma ve kayıt sahipliği ise API tarafında kontrol edilir. İstemci arayüzünün değiştirilmesi API yetkilerini aşmaya yetmez.

## Bakım kaydı iş akışı

1. Kullanıcı motoru ve bakım türünü seçer. QR bağlantısı kullanılmışsa bu seçimlerden biri veya ikisi otomatik doldurulabilir.
2. Motor çalışma saati girilir. Birincil bakım türünün yanı sıra aynı işlemde tamamlanan ek bakım türleri seçilebilir.
3. Yeni kayıtlar için bakım başlangıç ve bitiş tarih+saatleri girilir. Bitiş zamanı başlangıçtan önce olamaz.
4. Kontrol listesindeki tüm maddeler tamamlanır. Yeni bakım kaydının geçerli olması için not, fotoğraf veya video kanıtlarından en az biri eklenir.
5. Bakımda çalışan diğer teknisyenler seçilir. Bu kişiler sorumlu teknisyenden ayrı tutulur.
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
├── api/                         # Auth, motor, kayıt, rapor, bildirim ve dışa aktarma API'leri
├── dashboard/                   # Ana kontrol paneli
├── tamamla/                     # Bakım tamamlama ve QR deep-link akışı
├── kayitlar/                    # Bakım listesi, detay ve düzenleme
├── motorlar/                    # Motor listesi, sağlık görünümü ve motor QR'ı
├── teknisyen-raporu/            # Teknisyen performans ve süre raporu
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
