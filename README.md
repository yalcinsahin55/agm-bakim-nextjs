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
