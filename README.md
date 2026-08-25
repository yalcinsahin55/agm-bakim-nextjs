# Avcıkoru Santrali Motor Bakım Merkezi

Avcıkoru Santrali’ndeki motorların periyodik bakım, çalışma saati, teknik ölçüm ve bakım geçmişini takip etmek için geliştirilmiş mobil öncelikli bir web uygulamasıdır. Uygulama telefon, tablet ve masaüstü bilgisayarlarda çalışır; PWA yaklaşımı, çevrimdışı kayıt kuyruğu, rol tabanlı yetkilendirme, medya kanıtı ve raporlama özelliklerini tek bir bakım merkezinde birleştirir.

**Üretim adresi:** [agm-bakim-nextjs.vercel.app](https://agm-bakim-nextjs.vercel.app)

> Bu proje şirket içi kullanım için hazırlanmıştır. Kaynak kodu özel bir işletme uygulamasına aittir ve üretim ortamında kullanılan gizli değişkenler depoya gönderilmemelidir.

## İçindekiler

- [Öne çıkan özellikler](#öne-çıkan-özellikler)
- [Kullanıcı rolleri](#kullanıcı-rolleri)
- [Teknisyen yetkilendirme](#teknisyen-yetkilendirme)
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
- [Legacy medya migration’ı](#legacy-medya-migrationı)
- [Geliştirme ve doğrulama komutları](#geliştirme-ve-doğrulama-komutları)
- [Bakım Asistanı sesli giriş ve hızlı dışa aktarma](#bakım-asistanı-sesli-giriş-ve-hızlı-dışa-aktarma)
- [Lisans](#lisans)

## Öne çıkan özellikler

| Alan | Özellikler |
|---|---|
| Motor yönetimi | Motor listesi, çalışma saati, yük bilgisi, saat geçmişi ve motor bazlı bakım durumu |
| Bakım kayıtları | Bakım türü, motor saati, not, kontrol listesi, fotoğraf/video kanıtı, PDF/Excel/Word rapor ekleri, yönetici teyidi ve bakım geçmişi |
| Zaman takibi | Başlangıç ve bitiş için tam tarih+saat, çok günlü/haftalık bakım desteği ve otomatik toplam süre hesabı |
| Ekip çalışması | Sorumlu teknisyen ile bakımda çalışan diğer teknisyenlerin ayrı tutulması; mekanik/elektromekanik türleri ve kişi bazlı katkı süreleri |
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
| `yonetici` | Tüm modüllere erişir; kullanıcı ekler/onaylar, motor ve bakım türlerini yönetir, bakım tamamlarken sorumlu/yetkili bakımcıyı seçer, tüm kayıtları düzenler/siler, sorumlu teknisyeni değiştirir, yanlış motora kaydedilen bakım kaydını doğru motora taşır, dış hizmet kaydı girer ve audit kayıtlarını inceler. |
| `teknisyen` | Yalnızca Bakım Tamamlama ve Bakım Kayıtları ekranlarını kullanır. Mobil ve masaüstü alt menüsünde yalnızca **Bakım Tamamla**, **Bakım Kayıtları** ve **Çıkış** bulunur. Düzenleme ve silme yetkisi yalnızca birincil/sorumlu teknisyen olarak kendisinin oluşturduğu kayıtlar içindir. Yardımcı teknisyen olmak tek başına düzenleme yetkisi vermez. |
| `goruntuleyici` | Dashboard, motorlar, bakım kayıtları, analiz ve takip, bilgi/rapor, bakım türleri ve tahmin modüllerini görüntüler; kayıt üzerinde değişiklik yapamaz. |
| `planlamaci` | Eski hesaplarla geriye dönük uyumluluk için teknisyen davranışıyla değerlendirilir. Yeni kullanıcı arayüzünde ayrı bir planlamacı akışı bulunmaz. |

Yetkilendirme iki katmanda uygulanır: menü ve sayfa görünürlüğü istemci tarafında, veri okuma/yazma ve kayıt sahipliği ise API tarafında kontrol edilir. İstemci arayüzünün değiştirilmesi API yetkilerini aşmaya yetmez.

## Teknisyen yetkilendirme

Yönetici, **Diğer Menüler → Yönetim → Teknisyen Yetkilendirme** ekranından aktif teknisyenleri **Mekanik** veya **Elektromekanik** olarak sınıflandırabilir. Mekanik teknisyenler tüm bakım türlerinde varsayılan olarak sorumlu veya yardımcı olabilir. Elektromekanik teknisyenler varsayılan olarak elektriksel işler ve devreye alma desteği için tanımlanır; sorumlu olarak seçilmeleri yönetici tarafından ayrıca açılır.

Aynı ekranda teknisyenin sorumlu olabilmesi, yardımcı olabilmesi ve çalışma alanları yönetilir. Bakım Türü Yönetimi ekranındaki çalışma alanı ve elektromekanik destek ayarlarıyla birlikte, Bakım Tamamla ve Bakım Kayıtları formlarında yalnızca uyumlu teknisyenler listelenir. Bu seçimler API tarafında da tekrar doğrulanır; istemciden gönderilen yetkisiz bir teknisyen kaydı kabul edilmez. Eski hesaplar ve eski bakım kayıtları bozulmaz; yeni alanı olmayan teknisyenler mekanik varsayılanlarıyla çalışır.

### Bakım türü silme ve veri güvenliği

Bir bakım türü silindiğinde geçmiş bakım kayıtları fiziksel olarak silinmez. Tür `is_deleted` işaretiyle pasifleştirilir; aktif bakım panelleri, yeni kayıt formları, bildirimler ve sağlık filtreleri bu türü göstermeyi bırakır, ancak geçmiş kayıtlar ve rapor tarihçesi korunur. Böylece yanlış silme yüzünden yüzlerce bakım kaydının kaybolması engellenir. Yönetici, **Bakım Türü Yönetimi** ekranındaki **Arşivlenmiş bakım türleri** bölümünden gizlenen türü yeniden aktifleştirebilir; geri alma geçmiş kayıtları değiştirmez. Yönetici motor kapsamını bakım türünü silmeden de **Dahil** seçeneğiyle motor bazında kaldırabilir.

Seed, yedek geri yükleme, içe aktarma, bakım kaydı ve medya yükleme endpoint’lerinde yönetici/kullanıcı yetkisi ve uygun rate limit kontrolleri bulunur. Yedek geri yükleme yalnızca izin verilen koleksiyonları işler; MongoDB özel anahtarları, hassas alanlar ve güvenli olmayan kimlikler temizlenir. Excel içe aktarma işlemleri çalışma sayfası, satır, sütun ve istek gövdesi limitleriyle sınırlandırılmıştır; dışa aktarılan hücrelerde `=`, `+`, `-` veya `@` ile başlayan kullanıcı metinleri Excel formülü olarak çalıştırılmayacak şekilde kaçışlanır. Production bağımlılıkları için `npm audit --omit=dev --audit-level=high` kontrolü yapılır; Next.js, PostCSS, Sharp ve UUID yamalı sürümlere sabitlenmiştir.

Dağıtık rate limit için production’da `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` ve ayrı bir `RATE_LIMIT_KEY_SECRET` tanımlanır. Kritik login/yazma/upload işlemleri Redis erişilemiyorsa güvenli biçimde geçici `503` döndürür; Redis değişkenleri olmayan local geliştirmede bellek içi fallback kullanılabilir. Kullanıcı yönetimindeki **Pasifleştir** işlemi fiziksel silme yapmaz; hesabı pasif/onaysız duruma getirir, audit log yazar ve geçmiş bakım kayıtlarını korur. Excel import akışı güvenli `ExcelJS` ile `.xlsx` dosyalarını destekler; eski `.xls` dosyaları önce `.xlsx` formatına dönüştürülmelidir.

## Bakım kaydı iş akışı

1. Kullanıcı motoru ve bakım türünü seçer. QR bağlantısı kullanılmışsa bu seçimlerden biri veya ikisi otomatik doldurulabilir.
2. Motor çalışma saati girilir. Birincil bakım türünün yanı sıra aynı işlemde tamamlanan ek bakım türleri seçilebilir.
3. Yeni kayıtlarda bakım tarihi ayrıca seçilmez; bakım başlangıç ve bitiş tarih+saatleri tek tarih kaynağıdır. Bitiş zamanı başlangıçtan önce olamaz.
4. Kontrol listesindeki tüm maddeler tamamlanır. Yeni bakım kaydının geçerli olması için not, fotoğraf/video veya PDF/Excel/Word rapor eki kanıtlarından en az biri eklenir.
5. Bakımda çalışan diğer teknisyenler seçilir. Bu kişiler sorumlu teknisyenden ayrı tutulur. Yönetici bakım tamamlıyorsa sorumlu/yetkili bakımcıyı ayrıca seçebilir; bu alan teknisyenlere açılmaz.
6. Kayıt çevrimiçiyse API’ye gönderilir; bağlantı yoksa IndexedDB kuyruğuna alınır ve bağlantı geri geldiğinde senkronize edilir.
7. Sunucu tarafı motoru, bakım türünü, kanıtları, teknisyenleri ve zaman alanlarını doğrular; bakım süresini kendisi hesaplayarak kaydeder.
8. Kaydı oluşturan kullanıcı yönetici değilse kayıt `manager_confirmation_status: pending` olarak açılır ve Bakım Kayıtları ekranında **Teyit bekliyor** görünür. Yönetici tarafından oluşturulan kayıtlar sunucu tarafında otomatik olarak teyitli açılır.
9. Yönetici, Bakım Kayıtları ekranında kaydı ve kanıtlarını inceledikten sonra yalnızca kendisine gösterilen **Teyit et** düğmesini kullanır. Teyit API’de ayrıca korunur; istemciden gönderilen sahte teyit alanları kabul edilmez.
10. Aynı işlemde seçilen ek bakım türleri `group_id` ile birlikte teyit edilir. Teyit işlemi audit log’a yazılır; sorumlu veya yardımcı teknisyen bu düğmeyi göremez ve API’den de kullanamaz.
11. Yönetici teyit penceresinde yanlış motora kaydedilmiş bir kaydı doğru motora taşıyabilir. Grouped bakım olayındaki kardeş kayıtlar birlikte taşınır; motor adı veritabanından doğrulanır, eski motorun bakım takip state’i kalan kayıtlar üzerinden, yeni motorun state’i taşınan kayıtlar üzerinden yeniden hesaplanır. Motor değişikliği yalnızca yöneticiye açıktır ve kayıt güncellemesi, tracking düzeltmesi ile audit kaydı transaction içinde tamamlanır.

Eski kayıtlar ve eski çevrimdışı payload’lar geriye dönük uyumluluk için korunur. Yeni kullanıcı arayüzü `time_tracking_version: 2` gönderdiği için yeni kayıtlar tam tarih+saat zorunluluğuna tabidir.

## Tarih-saat ve süre takibi

Bakım süresi yalnızca saat olarak değil, tam tarih+saat aralığı olarak tutulur. Bu nedenle gece yarısını aşan, birkaç gün süren veya haftalık bakımlar desteklenir.

- `maintenance_start_at`: Bakım başlangıç zamanı.
- `maintenance_end_at`: Bakım bitiş zamanı.
- `maintenance_duration_minutes`: API tarafından başlangıç ve bitiş arasından hesaplanan toplam dakika.
- `record_date`: Eski istemcilerle geriye dönük uyumluluk için korunur; yeni kullanıcı arayüzünde ayrıca seçilmez. Geriye dönük kayıt işareti başlangıç tarih-saatinden türetilir.

Tarih+saat değerleri API ve veritabanı katmanında UTC tabanlı saklanır; kullanıcı arayüzünde cihazın yerel saat dilimine çevrilerek gösterilir. Böylece telefon ve bilgisayar arasında saat kayması azaltılır.

## Ekip teknisyenleri ve dış hizmet bakımları

Bir bakımın birincil sorumlu teknisyeni ile destek olan diğer teknisyenler ayrı alanlarda tutulur. Yönetici kullanıcıları oluştururken teknisyen hesabını **Mekanik teknisyen** veya **Elektromekanik teknisyen** olarak sınıflandırabilir. Elektromekanik çalışanlar genellikle elektriksel işler ve devreye alma desteği için yardımcı seçilir; istisnai olarak sorumlu seçilirse bu durum da kayıt üzerinde açıkça korunur. Her yardımcı teknisyenin o bakıma ayırdığı süre ayrıca girilebilir; destek teknisyeni için **0 dakika** da geçerli bir katkı değeridir ve yalnızca boş/geçersiz girişlerde varsayılan süre kullanılır. Teknisyen performans raporu tür, rol ve kişi bazında görevleri ve katkı sürelerini ayrı gösterir.

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

`/asistan` ekranı, AGM Bakım verileri hakkında salt okunur sorulara cevap verir. Bakım özeti, gecikmiş bakımlar, motor bakım geçmişi, dış hizmet kayıtları ve teknisyen performansı sorgulanabilir. Tarih ifadeleri `23.08.2026`, `2026-08-23`, `5 Ağustos 2026`, `Ağustos 2026`, `01.08.2026 - 15.08.2026`, `bu hafta`, `geçen ay` ve `2026 yılında` gibi biçimlerde çözümlenir. Kullanıcı belirli bir motorun yapılan bakım kayıtlarını ve varsa PDF/Excel/Word rapor eklerini sorabilir; tarih aralığı eklediğinde yalnızca o tarih aralığına düşen bakım başlangıç/kayıt tarihleri filtrelenir. Sonuç satırı açıldığında rapor dosyaları authenticated same-origin bağlantılar üzerinden görüntülenebilir veya indirilebilir; ham Blob URL’si ya da dosya byte’ı asistan cevabına verilmez. `tümünü göster`, `hepsini listele` gibi ifadeler sonuçları güvenli üst sınır olan 500 satıra kadar genişletir. Belirli bir motor ve bakım türü için asistan bakım periyodunda **son bakımdan beri motorun kaç saat çalıştığını**, bakım işinde kaydedilmiş **ekip çalışma süresini**, son bakım işinin süresini, tamamlanan bakım adedini ve kalan/gecikmiş periyodu birlikte gösterir. Kullanıcı belirli bir bakım türü vermeden motor için tüm bakım türlerini istediğinde aynı alanlar bakım türü bazında listelenir. Kullanıcı belirli bir teknisyenin hangi bakım türlerinde veya motorlarda sorumlu/yardımcı olarak çalıştığını; ayrıca belirli dönemde en çok görev alan teknisyeni sorabilir. Birleşik sorgularda motor, bakım türü, iç ekip/dış hizmet, sorumluluk rolü, ekip çalışması, fotoğraf/video/not/kontrol listesi kanıtı, motor çalışma saati, bakım süresi ve mevcut bakım durumu birlikte kullanılabilir. **Teyit bekleyen bakımlar** filtresi yalnızca yeni akışta açıkça `manager_confirmation_status: pending` olan kayıtları döndürür; teyit alanı bulunmayan eski kayıtlar geriye dönük olarak bekleyen kuyruğa alınmaz. Asistan yalnızca önceden tanımlı okuma araçlarını çağırır; doğrudan MongoDB sorgusu çalıştırmaz ve hiçbir kayıt üzerinde yazma veya teyit işlemi yapamaz.

`lib/assistantPolicy.ts` soru uzunluğu, prompt injection, yazma talebi, hassas bilgi ve kesin arıza teşhisi isteklerini filtreler. Tarih aralığı policy katmanında doğrulanır; tarih bazlı özel sorgularda bakım başlangıç tarihi, eski kayıtlarda ise geriye dönük uyumluluk için oluşturulma tarihi kullanılır. Motor saati ve bakım süresi aralıkları, kanıt türü, ekip, kaynak, rol ve durum filtreleri policy çıktısına aktarılır. `/api/assistant` oturum, rol, rate limit ve içerik boyutu kontrollerinden sonra yalnızca rapor verilerini döndürür. Ham medya, base64 içerik, şifre, token ve gereksiz kişisel bilgiler asistan cevabına aktarılmaz.

### Teknisyen raporu

`/teknisyen-raporu` ekranı seçilen döneme göre aşağıdaki metrikleri sunar:

- Bu ay, son 3 ay, bu yıl ve tüm kayıtlar filtreleri.
- Toplam bakım kaydı ve teknisyen görevi.
- Sorumlu ve destek görevleri.
- Toplam teknisyen katkı süresi ve görev başına ortalama süre.
- Mekanik ve elektromekanik teknisyen türü bazında kişi, sorumlu, destek, görev ve toplam süre özetleri.
- Teknisyen bazında bakım türü ve motor dağılımları.
- Süre bilgisi bulunmayan eski kayıtlar için uyumluluk uyarısı.

Ekip bakımında bir işin süresi katılımcı teknisyenlerin katkısına ayrı ayrı yazılır. Dış hizmet kayıtları bu rapora dahil edilmez.

### Motor raporu ve istatistikler

Motor bazlı rapor; bakım türünü, motor saatini, sorumlu ve ekip teknisyenlerini, başlangıç/bitiş tarih+saatlerini ve toplam süreyi gösterir. Dashboard ve istatistik ekranları bakım sayısı, dönem ve motor durumlarını özetler.

### Excel ve PDF

Bakım geçmişi Excel ve PDF olarak dışa aktarılabilir. Dışa aktarımlarda motor, bakım türü, bakım tarihi, motor saati, başlangıç, bitiş, toplam süre, sorumlu teknisyen, ekip teknisyenleri ve **yönetici teyit durumu** birlikte sunulur. Excel teyit eden yöneticiyi ve teyit tarihini de içerir; PDF raporu yeni zaman ve teyit sütunlarını A4 sayfa genişliğine sığdırılmış dengeli kolonlarla gösterir.

## Bakım Asistanı sesli giriş ve hızlı dışa aktarma

Asistan ekranındaki mikrofon düğmesi, destekleyen mobil ve masaüstü tarayıcılarda `SpeechRecognition` ile Türkçe konuşmayı soru kutusuna çevirir. Dinleme, mikrofon izni ve hata durumları ekranda görünür; ses metne dönüştürüldükten sonra otomatik gönderilmez ve kullanıcı metni kontrol edip düzenleyebilir. Tarayıcı desteklemiyorsa normal metin kutusu çalışmaya devam eder; mobil kullanıcılar cihaz klavyesinin mikrofonunu da kullanabilir. AGM Bakım ses kaydı yüklemez veya saklamaz.

Asistan cevaplarının uygun olduğu yerlerde **PDF indir** ve **Excel indir** düğmeleri görünür. Bu düğmeler cevabın dönem, motor, teknisyen, dış hizmet, sağlık durumu, geriye dönük kayıt, eksik zaman ve **yönetici teyidi bekleyen** kayıt filtrelerini mevcut export endpointlerine taşır. Motor bakım geçmişi dışa aktarımında rapor eki dosya adları; bakım sağlığı dışa aktarımında son bakımdan beri motor çalışma saati, bakım işi süresi ve kalan/gecikme alanları korunur. Export işlemi de normal oturum ve rol kontrollerinden geçer; dış hizmet kayıtları için `source=external_service`, teknisyen raporu için `technician_id` filtresi kullanılabilir.

Dashboard’da gecikmiş bakım uyarısının hemen altında, sayfadan ayrılmadan soru yazılabilen **Bakım Asistanı** kutusu bulunur. Tarih ve teknisyen sorguları da aynı salt-okunur endpoint üzerinden cevaplanır. Asistan; gecikmiş, kritik, yaklaşan ve normal sağlık durumlarını; geriye dönük kayıtları; başlangıç/bitiş zamanı eksik kayıtları ve yönetici teyidi bekleyen kayıtları tarih, motor, bakım türü, teknisyen, rol, kaynak, kanıt, motor saati, süre ve ekip filtreleriyle birleştirebilir. Özet cevabındaki **motor dağılımı** satırına dokunulduğunda yeni bir asistan mesajı veya yeni bir sorgu oluşturulmaz; seçilen motorun hemen altında o motorda yapılan bakım türleri ve adetleri açılır. **Bakım türü dağılımı** satırına dokunulduğunda da aynı kart içinde o türün yapıldığı motorlar ve adetleri gösterilir. **Teknisyen sıralaması** satırına dokunulduğunda seçilen kişinin çalıştığı bakım türleri ve motorlar aynı kartın altında açılır. Motor adları, satırdaki gerçek `engine_id` ve tam motor adıyla eşleştirilir; böylece `AGM 7` gibi çok parçalı isimler `AGM 1` gibi başka bir motora düşmez. Kutudaki hızlı sorular doğrudan aynı alanda yanıtlanır; cevap hazırlandığında ekran otomatik olarak cevap bölümüne kayar. Detayları açmak soru yazmayı veya tekrar gönder düğmesine basmayı gerektirmez. Bu alan yalnızca hızlı erişim sağlar; asistanın salt okunur policy sınırlarını değiştirmez.

## Çevrimdışı çalışma

Bakım tamamlama formu bağlantı olmadığında kaydı tarayıcıdaki IndexedDB kuyruğuna alır. Fotoğraf ve video gibi bekleyen medya dosyaları da aynı kuyruk akışında tutulur. İnternet geri geldiğinde senkronizasyon yapılır; `client_request_id` gibi tekrar önleyici alanlar sayesinde aynı kaydın birden fazla kez oluşturulması engellenir.

Çevrimdışı senkronizasyon sırasında:

- Mevcut kayıtlar silinmez.
- Eski payload biçimleri desteklenir.
- Yeni v2 kayıtlarında başlangıç ve bitiş tarih+saatleri korunur.
- Medya veya PDF/Excel/Word rapor eki yükleme başarısızsa kayıt ve dosya kuyruğu kullanıcıya bildirilmeye devam eder.

## Medya depolama

Yeni fotoğraf ve video dosyaları Vercel Blob Storage’a yüklenir; MongoDB’de büyük medya byte’ları tutulmaz. MongoDB’de dosya URL’si ve gerekli metadata saklanır. Eski kayıtlardaki base64 fotoğraf/video biçimleri geriye dönük görüntüleme için desteklenir. Yeni kayıt ve düzenleme API’lerinde legacy base64 medya toplamı 8 MB ile sınırlandırılmıştır; yeni yüklemelerde Blob akışı kullanılmalıdır. Kayıt listeleri ve `GET /api/records/:id` varsayılan olarak ağır `photos_b64`/`videos` alanlarını taşımaz; kayıt detayında medya gerektiğinde `include_media=true` kullanılır. Bakım tamamlama ve kayıt düzenleme ekranlarında PDF, `.xls/.xlsx` ve `.doc/.docx` rapor ekleri Vercel Blob’a yüklenir; MongoDB’de yalnızca güvenli metadata tutulur. Dosya başına 20 MB, kayıt başına 10 dosya sınırı vardır. Rapor ekleri kayıt detayında authenticated same-origin proxy üzerinden PDF için önizlenebilir, Excel/Word için indirilebilir; liste endpointine dosya byte’ları eklenmez.

Tamamlanmayan parçalı video yüklemeleri `video_chunks.at` alanındaki 24 saatlik TTL index’i ile otomatik temizlenir. Başarısız veya yarım kalmış bir video yüklemesinin parçaları kalıcı olarak birikmez. Chunk kayıtları kullanıcı kimliğine bağlanır; bir kullanıcının yükleme parçaları başka bir kullanıcı tarafından okunamaz veya birleştirilemez. Çevrimdışı PATCH tekrarlarında ek bakım kayıtları deterministik idempotency anahtarıyla kontrol edilir; aynı ek bakım ikinci kez oluşturulmaz.

Vercel Blob kurulumu için proje içinde `BLOB_STORE_ID` ve `BLOB_READ_WRITE_TOKEN` değerlerinin ilgili ortama tanımlanması gerekir. Token değerleri kaynak koda yazılmamalı ve GitHub’a gönderilmemelidir. Motor/bakım panelinin server cache’i 10 saniyelik üst sınırla çalışır; motor, bakım türü veya bakım kaydı mutation’ları başarılı olduğunda aynı runtime içindeki cache anında temizlenir. Farklı serverless instance’larında bu süre TTL ile sınırlıdır.

## Teknoloji ve proje yapısı

### Teknoloji yığını

- **Next.js 15.5.21 App Router**
- **React 18** ve **TypeScript**
- **MongoDB Atlas**
- **Tailwind CSS 3**
- **Vercel** ve Vercel Blob Storage
- **Web Push** bildirimleri
- **PDFKit** ile PDF, **ExcelJS** ile Excel içe/dışa aktarma
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
├── excel.ts                     # ExcelJS parser/limit yardımcıları
├── spreadsheetSecurity.ts       # Excel formül enjeksiyonu kaçışı
├── mongoSecurity.ts             # Dinamik Mongo path doğrulaması
└── ...
middleware.ts                   # Route koruması ve auth yönlendirmeleri
public/                          # Manifest, ikon ve küçük statik dosyalar
vercel.json                      # Cron zamanlaması
.env.example                    # Environment değişkeni örneği
```

## Yerel kurulum

### Gereksinimler

- Node.js 18.18 veya üzeri; geliştirme için Node.js 20 LTS önerilir.
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
| `UPSTASH_REDIS_REST_URL` veya `KV_REST_API_URL` | Dağıtık rate limit için | Upstash Redis REST endpoint’i; Vercel Marketplace bağlantısında `KV_REST_API_URL`, manuel kurulumda `UPSTASH_REDIS_REST_URL` kullanılır. |
| `UPSTASH_REDIS_REST_TOKEN` veya `KV_REST_API_TOKEN` | Dağıtık rate limit için | Redis REST token’ı; `NEXT_PUBLIC_` ile başlamamalı ve istemciye gönderilmemelidir. Vercel entegrasyonu `KV_REST_API_TOKEN` ekler. |
| `RATE_LIMIT_KEY_SECRET` | Dağıtık rate limit için | Redis anahtarlarındaki identifier HMAC’i için uzun, ayrı ve rastgele secret. |
| `RATE_LIMIT_REDIS_TIMEOUT_MS` | İsteğe bağlı | Redis kontrol timeout’u; varsayılan 750 ms, 100–5000 ms aralığı kabul edilir. |
| `PDF_ALLOWED_HOSTS` | İsteğe bağlı | Vercel Blob dışındaki, yönetici tarafından önceden onaylanmış HTTPS PDF hostlarını virgülle ayırarak ekler. Boş bırakılırsa yalnızca Vercel public Blob hostları kabul edilir. |
| `PUSH_ALLOWED_HOSTS` | İsteğe bağlı | Varsayılan Web Push sağlayıcıları dışındaki, önceden onaylanmış HTTPS push endpoint hostlarını virgülle ayırarak ekler. |

Dağıtık rate limit production ve Preview’da Redis erişimi olmadan fail-closed çalışır; local geliştirmede Redis değişkenleri yoksa yalnızca yerel instance fallback’i kullanılır. Bu fallback dağıtık koruma veya DDoS koruması değildir. Excel içe aktarma akışları `.xlsx` ve ExcelJS kullanır; boş saat/yük hücreleri mevcut motor değerini sıfırlamaz, geçerli dolu değerler işlenir.

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

Vercel’de Preview, Production ve gerekiyorsa Development ortamlarına farklı veritabanı veya Blob değerleri tanımlanması önerilir. `PDF_ALLOWED_HOSTS` ve `PUSH_ALLOWED_HOSTS` yalnızca gerçekten kullanılan, güvenilir HTTPS hostları için doldurulmalıdır; bu allowlist’ler SSRF riskini azaltmak amacıyla sunucu tarafında doğrulanır. Yerel build sırasında üretim veritabanına yazmamak için ayrı bir test veritabanı kullanın.

## Rapor ekleri ve kayıt idempotency

Bakım tamamlama ve bakım kaydı düzenleme ekranlarında PDF, XLS/XLSX, DOC/DOCX raporları Vercel Blob client upload akışıyla doğrudan public Blob store’a yüklenir. Böylece en fazla 20 MB olan rapor dosyaları Next.js serverless function request gövdesinden geçirilmez; server yalnızca kimliği doğrulanmış kullanıcı için kısa ömürlü ve MIME/boyut/path kısıtlı upload yetkisi üretir. Çevrimdışı rapor ekleri de bağlantı geldiğinde aynı helper üzerinden yüklenir ve kayıt payload’ına yalnız gerçek Blob URL’si yazılır.

Yeni bakım kaydı birden fazla bakım türü içeriyorsa ana kayıt ile ek kayıtlar aynı `client_request_id` değerini paylaşmaz. Ana kayıt istemciden gelen id’yi, her ek kayıt ise deterministik tekil id’yi kullanır; bu sayede sparse unique index üzerinde `insert_extra_record` duplicate-key hatası oluşmaz ve çevrimdışı yeniden gönderimler idempotent kalır.

## Bildirimler ve otomatik yenileme

Web Push isteğe bağlıdır. Kullanıcı, Bildirimler ekranından tarayıcı bildirim izni verdiğinde abonelik bilgisi sunucuya kaydedilir. Bakım durumu değiştiğinde veya gecikmiş/kritik/yaklaşan bakım oluştuğunda uygun bildirimler gönderilebilir.

Bildirim listesi endpoint’i artık sayfa açılışında bakım durumlarını yeniden üretmez; `/api/notifications` yalnızca mevcut bildirimleri okur. Zil sayacı daha hafif olan `/api/notifications/unread-count` GET endpoint’ini kullanır. Kullanıcı bildirimler ekranındaki **Bildirimleri yenile** düğmesine basmadıkça pahalı refresh POST akışı çalışmaz. Böylece her Dashboard veya modül açılışında gereksiz bakım türü, motor ve bildirim yazma sorguları çalışmaz. Yeni gecikmiş/kritik/yaklaşan bakım bildirimleri zamanlanmış cron akışında hazırlanır.

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

Cron endpoint’i `CRON_SECRET` ile korunur. Cron zamanları UTC’dir; Türkiye’de görüntülenen yerel saatle karıştırılmamalıdır. Zamanlanmış akış aktif kullanıcıları ve gecikmiş/kritik/yaklaşan bakım listesini toplu olarak işler; her kullanıcı için gereksiz son bildirim listesi sorgusu çalıştırmaz. Manuel kayıt değişikliklerinden sonra istemci tarafındaki bakım paneli cache’i temizlenir.

Bakım paneli, aynı istemci içinde 15 saniyelik istek birleştirme/cache katmanına ve sıcak sunucu instance’ında 10 saniyelik kısa cache’e sahiptir. Motor veya bakım türü değiştiğinde kısa süreli stale veri ihtimali azaltılmıştır; kayıt oluşturma, düzenleme, silme ve çevrimdışı senkronizasyon sonrasında istemci cache’i açıkça temizlenir.

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

Yeni kayıtlar teknisyenleri sabit kullanıcı ID’siyle saklar. Eski kayıtlarda yalnızca görünen ad veya farklı yazım biçimleri bulunuyorsa `scripts/migrate-technician-source.mts` yardımcı aracı kullanılabilir. Araç varsayılan olarak **dry-run** çalışır; bu modda hiçbir kayıt değiştirilmez.

Önce üretim veritabanının ayrı ve erişimi kısıtlı bir yedeğini alın. Ardından proje kök dizininde yalnızca rapor üretin:

```bash
node --experimental-strip-types scripts/migrate-technician-source.mts --report=migration-output/technician-preview.json
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
node --experimental-strip-types scripts/migrate-technician-source.mts \
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
node --experimental-strip-types scripts/migrate-technician-source.mts \
  --rollback=migration-output/technician-backup.json \
  --max-changes=1000 \
  --apply \
  --confirm=ROLLBACK-TECHNICIAN-SOURCE-MIGRATION
```

Script yalnızca `technician_source`, `technician_id`, `technician_name` ve `external_service_name` alanlarına dokunur; motor, bakım türü, tarih-saat, medya, not, kontrol listesi ve ekip teknisyeni alanlarını değiştirmez. `migration-output/` klasörü `.gitignore` içinde tutulduğu için rapor ve yedekler GitHub’a gönderilmez. Migration tamamlandıktan sonra Teknisyen Raporu’nu yenileyerek isim varyasyonlarının tek satırda birleştiğini, dış hizmet kayıtlarının ise teknisyen metriklerine dahil olmadığını kontrol edin.

Yeni doğal anahtar geçişinin ilk aşaması olarak yeni kullanıcı, motor ve motor bilgi kartlarına immutable `stable_id` eklenir; mevcut telefon/motor adı tabanlı `_id` alanları değiştirilmez. Eksik eski stable ID’leri önce dry-run ile inceleyin:

```bash
npm run migrate:stable-keys -- --report=migration-output/stable-keys-preview.json
```

Eski `planlamaci` rolü için de aynı kontrollü yaklaşım kullanılır. Uygulama mevcut eski hesapları geriye dönük olarak teknisyen davranışıyla çalıştırmaya devam eder. Yetkili migration kararı alınırsa önce rapor alın, sonra ayrı yedek ve explicit onay token’ı ile apply edin:

```bash
npm run migrate:legacy-role -- --report=migration-output/legacy-role-preview.json
```

Her iki script de varsayılan olarak veri değiştirmez. Apply ve rollback yalnızca ilgili `--confirm` değeri, değişiklik üst sınırı ve migration backup dosyası ile çalışır.

## Legacy medya migration’ı

Eski bakım kayıtlarında kalan açık `data:*;base64,` fotoğraf ve doğrulanabilir base64 video içerikleri Vercel Blob URL’lerine taşınabilir. Normal Blob URL’leri, mevcut video referansları ve doğrulanamayan içerikler olduğu gibi korunur; migration fiziksel bakım kaydı silmez ve fotoğraf/video alanlarını yalnızca başarılı Blob yüklemesi ile veritabanı güncellemesi birlikte tamamlandığında değiştirir. Her kaydın eski `photos_b64`, `photos` ve `videos` değerleri, veritabanı güncellemesinden önce atomik backup dosyasına yazılır.

Önce erişimi kısıtlı bir test/staging veritabanında ve Blob store’da dry-run raporu alın:

```bash
npm run migrate:legacy-media -- \
  --report=migration-output/legacy-media-preview.json \
  --max-changes=100
```

Dry-run hiçbir veritabanı veya Blob değişikliği yapmaz. Apply işlemi varsayılan olarak kapalıdır; çalıştırmak için ayrı bir backup yolu, explicit confirmation token’ı ve zorunlu `--max-changes` sınırı verilmelidir. Uygun bir kayıt sayısı sınırı aşarsa işlem başlamadan durur. Apply sırasında yeni Blob yüklenir, rollback kaydı DB update’inden önce yazılır ve DB güncellemesi başarısız olursa yüklenen Blob’lar temizlenmeye çalışılır:

```bash
npm run migrate:legacy-media -- \
  --report=migration-output/legacy-media-apply.json \
  --backup=migration-output/legacy-media-backup.json \
  --max-changes=25 \
  --apply \
  --confirm=APPLY-LEGACY-MEDIA-MIGRATION
```

Hatalı bir eşleşmede yalnızca bu migration’ın backup dosyasındaki alanları geri yükleyin:

```bash
npm run migrate:legacy-media -- \
  --rollback=migration-output/legacy-media-backup.json \
  --max-changes=25 \
  --apply \
  --confirm=ROLLBACK-LEGACY-MEDIA-MIGRATION
```

Bu script bu refaktör paketi kapsamında **production üzerinde çalıştırılmamıştır**. Production migration kararı verilirse önce Atlas snapshot, ayrı Blob store/backup, staging dry-run ve küçük bir pilot parti ile doğrulama yapılmalıdır. `migration-output/` GitHub’a gönderilmemelidir.

## Birlikte tamamlanan eski bakımlarda süre tekilleştirme

Aynı işlem sırasında birden fazla bakım türü tamamlandığında uygulama bu türleri ayrı bakım kaydı olarak saklamaya devam eder. Ancak aynı `group_id` altındaki kayıtlar Teknisyen Raporu, analitik özetler ve Bakım Asistanı teknisyen istatistiklerinde tek bir ekip çalışması olarak sayılır. Böylece kişi katkı süresi ve görev toplamı, aynı bakım türü sayısı kadar çoğalmaz; bakım türü bazlı kayıt sayıları ise ayrı kalır.

Geçmişte birlikte tamamlanan eski kayıtlarda `group_id` bulunmuyorsa, önce ayrı ve erişimi kısıtlı MongoDB yedeği alın. Ardından varsayılan dry-run ile yalnızca güçlü eşleşmeleri önizleyin:

```bash
node --experimental-strip-types scripts/migrate-grouped-maintenance-records.mts \
  --report=migration-output/grouped-maintenance-preview.json
```

Araç; aynı motor, tarih-saat, motor çalışma saati, sorumlu/ekip izi ve ortak grouped/client işaretlerine sahip birden fazla bakım türünü aday grup olarak değerlendirir. Mevcut `group_id` taşıyan kayıtlara dokunmaz. Belirsiz veya zayıf eşleşmeler değiştirilmez. Apply modunda yalnızca eksik `group_id` alanı yazılır; teknisyen, süre, bakım türü, medya ve tarih alanları değişmez:

```bash
node --experimental-strip-types scripts/migrate-grouped-maintenance-records.mts \
  --report=migration-output/grouped-maintenance-apply.json \
  --backup=migration-output/grouped-maintenance-backup.json \
  --max-changes=1000 \
  --apply \
  --confirm=APPLY-GROUPED-MAINTENANCE-MIGRATION
```

Apply işlemi explicit onay, değişiklik üst sınırı ve atomik backup olmadan çalışmaz. Apply sırasında beklenmeyen hata olursa script uygulanan kayıtları otomatik geri almaya çalışır. Gerekirse yalnızca oluşturulan backup ile geri alabilirsiniz:

```bash
node --experimental-strip-types scripts/migrate-grouped-maintenance-records.mts \
  --rollback=migration-output/grouped-maintenance-backup.json \
  --max-changes=1000 \
  --apply \
  --confirm=ROLLBACK-GROUPED-MAINTENANCE-MIGRATION
```

Migration sonrasında Teknisyen Raporu’ndaki görev ve toplam çalışma süresini yenileyin. Aynı grouped bakımın tür satırları ayrı görünebilir; bu beklenen davranıştır. Süre ve kişi görevi toplamları ise grup başına bir kez hesaplanır.

## TypeScript kaynak standardı

Uygulamanın takip edilen uygulama, bileşen, kütüphane, test ve operasyon scripti kaynakları `.ts`, `.tsx` veya `.mts` uzantısındadır. `tsconfig.json` içinde `strict: true` ve `allowJs: false` korunur; böylece yeni JavaScript uygulama kodu eklenmesi typecheck aşamasında engellenir. `next.config.ts`, `tailwind.config.ts` ve `eslint.config.ts` typed config olarak yüklenir. Next.js 15.5’in PostCSS pipeline’ı TypeScript configini bu projede yüklemediği için `postcss.config.js` küçük bir CommonJS bridge’i olarak bilinçli biçimde korunur; bu dosya uygulama kodu değildir ve Tailwind derlemesinin çalışması için gereklidir.

Service worker için tarayıcının beklediği sabit `/sw.js` URL’si korunur. Kaynak dosya `lib/serviceWorker.ts` içindedir; `predev` ve `prebuild` adımları bunu TypeScript compiler ile `public/sw.js` çıktısına dönüştürür. `public/sw.js` generated olduğu için Git tarafından izlenmez. Beş legacy MongoDB migration scripti de `.mts` olarak çalışır; heterojen eski kayıt şekilleri nedeniyle bu operasyonel dosyalarda `@ts-nocheck` sınırı bulunur, ancak uygulama runtime’ı ve test kaynakları strict typecheck kapsamındadır. Bu scriptlerde davranış değişikliği yapılmamış, yalnızca çalıştırma ve kaynak uzantısı standardı güncellenmiştir.

| Kaynak grubu | Durum |
|---|---|
| `app/`, `components/`, `lib/` | TypeScript/TSX ve strict typecheck kapsamı |
| Next/Tailwind/ESLint configleri | Typed TypeScript config |
| PostCSS config | Next.js CSS pipelineı için zorunlu küçük CommonJS bridge: `postcss.config.js` |
| `tests/` ve read-only smoke | `.mts`, native Node TypeScript çalıştırma |
| Migration scriptleri | `.mts`, legacy veri şekilleri için açık `@ts-nocheck` sınırı |
| Browser service worker | Kaynak `lib/serviceWorker.ts`, generated çıktı `public/sw.js` |

## Geliştirme ve doğrulama komutları

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusunu başlatır. |
| `npm run build` | Next.js production derlemesini oluşturur. |
| `npm run start` | Production derlemesini çalıştırır. |
| `npm run typecheck` | Repository’nin normal TypeScript tip kontrolünü yapar. |
| `npm test` | Repo içindeki auth, medya, bulkWrite, upload, backup ve notification regression testlerini çalıştırır. |
| `npx tsc --noEmit --strict --skipLibCheck` | Strict TypeScript tip kontrolünü yapar. |
| `npx tsc --noEmit --pretty false` | TypeScript tip kontrolü yapar. |
| `npm run migrate:stable-keys` | Kullanıcı, motor ve motor bilgi kartlarında eksik stable ID’leri varsayılan dry-run ile raporlar. |
| `npm run migrate:legacy-role` | Eski `planlamaci` hesaplarının kontrollü dry-run raporunu üretir. |
| `npm run migrate:legacy-media` | Legacy base64 fotoğraf/video içeriklerinin Blob’a taşınmasını varsayılan dry-run ile raporlar. Apply için explicit onay, backup ve `--max-changes` zorunludur. |
| `git diff --check` | Boşluk ve patch kaynaklı diff sorunlarını kontrol eder. |
| `npx tsx /home/ubuntu/agm-audit-regression.ts` | Güvenlik, soft-delete, TTL ve legacy medya sınırı için geçici regresyon kontrolü. |
| `BASE_URL=https://staging.example node --experimental-strip-types scripts/staging-load-smoke.mts` | Yalnızca GET yapan, güvenli staging smoke/load kontrolü; varsayılan olarak auth’suz 307/401 yanıtlarını doğrular. |

Staging smoke/load kontrolü yalnızca test ortamında çalıştırılmalıdır. Script POST, PATCH veya DELETE göndermez; production alan adını açık onay olmadan reddeder. Yetkili staging oturumu ile test etmek için cookie değeri yalnızca yerel shell değişkeni olarak verilebilir:

```bash
BASE_URL=https://staging.example \
AUTH_COOKIE='agm_session=staging-cookie' \
CONCURRENCY=4 ROUNDS=3 \
node --experimental-strip-types scripts/staging-load-smoke.mts
```

Yayın öncesi asgari doğrulama:

```bash
git diff --check
npm test
npm run typecheck
npx tsc --noEmit --strict --skipLibCheck
npm audit --omit=dev --audit-level=high
npm run build
git status --short --branch
```

Bildirimler sayfası açılırken GET endpointi yalnızca mevcut bildirimleri okur. Bakım durumlarının yeniden hesaplanması ve eski bildirimlerin temizlenmesi yalnızca oturum ve rate-limit korumalı `POST /api/notifications/refresh` endpointi üzerinden yapılır. Eski `GET /api/notifications?refresh=1` çağrıları mutation çalıştırmadan 405 döner.

Yedek geri yüklemeden önce yedek ekranındaki **Dry-run kontrolü** kullanılmalıdır. Komut satırı veya API çağrısı gerekiyorsa gövdeye `confirm: "RESTORE"` ve `dry_run: true` gönderildiğinde hiçbir veri yazılmaz; yalnızca koleksiyon bazında uygulanacak ve atlanacak kayıt özeti döner. Gerçek merge işlemi batch `bulkWrite` ile yapılır ve yedekleme rate-limit’i ile korunur.

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
