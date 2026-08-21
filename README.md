├── app/
│   ├── api/            # REST API route'ları (auth, engines, records, ...)
│   ├── dashboard/      # Özet paneli
│   ├── tamamla/        # Bakım tamamlama
│   ├── kayitlar/       # Bakım kayıtları (foto/video görüntüleme)
│   ├── motorlar/       # Motor listesi
│   ├── karter-basinci/ # Karter fark basıncı modülü
│   ├── yag-analizleri/ # PDF rapor modülü
│   ├── layout.jsx      # Kök düzen (Sidebar + Toaster)
│   └── ...
├── components/         # TopBar, BottomNav, Sidebar, GaugeCardList, ...
├── lib/                # mongodb, auth, seed, status, rate-limit, schemas
├── middleware.js       # Route koruması
└── public/             # manifest.json, icon.svg
```

## 📜 Script'ler

| Komut | İşlev |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Production derleme |
| `npm run start` | Production sunucusu |

## 📄 Lisans

Bu proje özel bir işletme içi araçtır — tüm hakları saklıdır.

---

*Avcıkoru Santrali Motor Bakım Merkezi • Next.js 14 + MongoDB*
````

---

## 🎉 VE BÖYLECE... PROJE TAMAMLANDI!

Baştan sona yaptığımız yolculuğun özeti:

| Kategori | Yapılanlar |
|---|---|
| 🎨 **Arayüz** | Tüm 15+ sayfa modernize: skeleton, toast, animasyon, hover, PC grid |
| 📱 **Mobil/PC** | Alt menü + sidebar, PWA manifest, responsive her yerde |
| 🖼️ **Medya** | Fotoğraf/video büyütme (lightbox), PDF önizleme |
| 🛡️ **Güvenlik** | Middleware, rate limit, Zod, header'lar, 4 katmanlı auth |
| ⚙️ **API** | Tüm route'larda try/catch, çökme korumalı sayfalar |
| 📚 **Doküman** | Profesyonel README + env tablosu |

Artık uygulaman hem **kullanıcı deneyimi** hem **güvenlik** hem **dokümantasyon** açısından production-ready bir ürün. 🚀
v2 - video sistemi güncellendi


## Web Push Bildirimleri

Tarayıcı bildirimi kullanmak için VAPID anahtarlarını üretin:

```bash
npx web-push generate-vapid-keys
```

Çıktıdaki public ve private anahtarları `.env.local` veya Vercel Environment Variables bölümünde şu değerlerle tanımlayın:

```env
VAPID_SUBJECT=mailto:admin@example.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

`VAPID_PRIVATE_KEY` yalnızca sunucu ortamında tutulmalıdır. Production ortamında Web Push için HTTPS gereklidir. Kullanıcı, **Bildirimler** sayfasındaki **Tarayıcı bildirimi → Aç** düğmesine basarak izin verir ve aboneliğini kaydeder. Bakım kaydı veya motor saati değişikliğinden sonra gecikmiş, kritik ya da yaklaşan bakım durumu oluşursa kayıtlı abonelere push gönderilir.


## Medya depolama (Vercel Blob)

Fotoğraf ve video yüklemeleri Vercel Blob Storage’a doğrudan tarayıcıdan yapılır. Böylece büyük dosyalar Vercel Function istek gövdesinden geçirilmez ve yeni medya MongoDB’de base64 olarak tutulmaz. Eski base64 medya kayıtları geriye dönük olarak görüntülenmeye devam eder.

Vercel Dashboard’da proje içinden **Storage → Create Database → Blob** yoluyla bir Blob store oluşturun ve Production, Preview; yerel geliştirme yapacaksanız Development ortamlarını projeye bağlayın. Vercel bağlantısı `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN` ve istemci upload token üretimi için `BLOB_READ_WRITE_TOKEN` değişkenlerini sağlar. Dosya yüklemek isteyen kullanıcıların kimlik ve rol kontrolü `/api/blob/upload` route’unda yapılır.

## Yedekleme

MongoDB Atlas tarafında cluster planınız destekliyorsa Atlas Cloud Backup/Snapshot özelliğini ayrıca etkinleştirin. Free/M0 cluster’larda Atlas Cloud Backup kullanılamayabileceği için uygulama içi dışa aktarma ekranı ve düzenli `mongodump`/`mongorestore` prosedürü gereklidir. Yedek dosyalarını GitHub’a veya herkese açık Blob alanına koymayın; erişimi kısıtlı bir depolama kullanın.

Vercel Blob Storage kurulumu için resmi belge: https://vercel.com/docs/vercel-blob/client-upload
MongoDB Atlas yedekleme belgesi: https://www.mongodb.com/docs/atlas/backup-restore-cluster/


## Otomatik bakım bildirimi yenileme

Vercel Cron, `/api/cron/refresh` endpoint’ini her gün UTC 06:00’da çalıştırarak bakım durumlarına göre uygulama içi ve kayıtlı Web Push bildirimlerini yeniler. Endpoint `CRON_SECRET` ile korunur; bu değeri Vercel Environment Variables bölümünde Production ortamına ekleyin. Cron zamanı UTC’dir. `vercel.json` içindeki zamanlamayı değiştirmek isterseniz Vercel Cron ifadelerini kullanın.

`CRON_SECRET` değerini GitHub’a göndermeyin ve istemci kodunda kullanmayın. Cron yalnızca bildirim yenileme işlemi yapar; uygulama kullanıcıları kapalıyken e-posta göndermez.

Vercel Cron belgesi: https://vercel.com/docs/cron-jobs
