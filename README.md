# AGM Motor Bakım Merkezi — Next.js Sürümü (Tam Sürüm)

Streamlit sürümünün aynı MongoDB veritabanını kullanan, mockup tasarımını
birebir uygulayan, hem mobil hem masaüstünde çalışan React (Next.js) sürümü.
Vercel'de ücretsiz barındırılır, Render/Streamlit Cloud'a ihtiyaç duymaz.

## Tüm modüller tamamlandı

- ✅ Giriş / kayıt sistemi (ilk kullanıcı otomatik yönetici olur)
- ✅ Özet (Dashboard) — durum kartları, motor yükleri, bakım türüne göre filtreleme
- ✅ Motorlar — her motorun tüm bakımlarını gösteren açılır kartlar
- ✅ Bakım Tamamla — geçmişe dönük kayıt, karter fark basıncı, birlikte
  tamamlanan diğer bakımlar, çoklu fotoğraf (otomatik sıkıştırmalı)
- ✅ Saat / Yük Güncelle — toplu motor saati/yükü güncelleme
- ✅ Bakım Türleri — tek tür için tüm motorları listeleme
- ✅ Bakım Tarihi Tahmini — 24 sa/gün varsayımıyla en geç bakım tarihi
- ✅ Yağ Analizleri — laboratuvar PDF raporu yükleme/indirme/silme
- ✅ Karter Fark Basıncı — ölçüm girişi, geçmiş grafiği, Excel içe aktarma
- ✅ Motor Bilgi Kartı — kaver/filtre/eşanjör referans bilgisi + Excel içe aktarma
- ✅ Bakım Kayıtları — listeleme, motor/tür filtresi, düzenleme (foto/video
  ekleme dahil), silme
- ✅ Saat Geçmişi — motor bazlı grafik ve tablo
- ✅ Bakım Aralıkları — art arda bakımlar arası saat farkı analizi
- ✅ Excel — çok sayfalı rapor indirme, saat/yük içe aktarma
- ✅ Kullanıcılar (admin) — kullanıcı ekleme, rol/aktiflik değiştirme
- ✅ Bakım Türü Yönetimi (admin) — yeni tür ekleme, düzenleme, silme
- ✅ Gerçek, tıklanabilir alt navigasyon çubuğu

## Bilgisayar Olmadan Canlıya Alma (Telefon/Tablet)

Aynı MongoDB Atlas veritabanını (motorlar, bakımlar, kullanıcılar — hepsi
zaten orada) kullanmaya devam ediyoruz, tekrar kurmanıza gerek yok.

### 1. GitHub'da yeni bir depo oluşturun

`agm-bakim-nextjs` gibi bir isimle boş bir depo açın.

### 2. Kodu yükleyin (Codespaces ile)

Depoda **Code → Codespaces → Create codespace on main**. Açıldığında bu projenin
zip dosyasını yükleyip terminalde:

```bash
unzip -o agm-bakim-nextjs.zip -d .
mv nextjs_app/* nextjs_app/.[!.]* . 2>/dev/null
rm -rf nextjs_app agm-bakim-nextjs.zip
git add . && git commit -m "İlk yükleme"
git push
```

### 3. Vercel'e bağlayın

1. `vercel.com` adresine gidin, **GitHub ile giriş yap**.
2. **Add New... → Project** → `agm-bakim-nextjs` deponuzu seçin.
3. **Environment Variables** kısmına şunları ekleyin (aynı Atlas bilgileriniz):
   - `MONGO_URI` — MongoDB Atlas bağlantı adresiniz
   - `MONGO_DB_NAME` — `agm_bakim`
   - `JWT_SECRET` — rastgele uzun bir metin
4. **Deploy** butonuna basın. 1-2 dakika içinde canlı adresiniz hazır olur:
   `https://agm-bakim-nextjs.vercel.app`

### 4. Test edin

`/login` sayfasından giriş yapın — Streamlit'te oluşturduğunuz hesap burada
da çalışır, çünkü aynı veritabanı kullanılıyor.

## Yerel geliştirme (isteğe bağlı, bilgisayarınız varsa)

```bash
npm install
cp .env.example .env.local   # değerleri doldurun
npm run dev
```

`http://localhost:3000` adresinde açılır.

## Proje yapısı

```
app/
├── login/                       Giriş / kayıt
├── dashboard/                   Özet
├── motorlar/                    Motorlar
├── tamamla/                     Bakım Tamamla
├── diger/                       Diğer menü (kalan tüm sayfalara link)
├── saat-guncelle/                Saat / Yük Güncelle
├── bakim-turleri/                 Bakım Türleri
├── tahmin/                        Bakım Tarihi Tahmini
├── yag-analizleri/                Yağ Analizleri
├── karter-basinci/                Karter Fark Basıncı
├── motor-bilgi/                   Motor Bilgi Kartı
├── kayitlar/                      Bakım Kayıtları
├── saat-gecmisi/                  Saat Geçmişi
├── araliklar/                     Bakım Aralıkları
├── excel/                         Excel
├── kullanicilar/                  Kullanıcılar (admin)
├── bakim-turu-yonetimi/           Bakım Türü Yönetimi (admin)
└── api/                           Tüm backend uç noktaları
components/                        Paylaşılan arayüz bileşenleri (GaugeRing, EngineBadge, vb.)
lib/                                MongoDB bağlantısı, kimlik doğrulama, durum hesaplama, seed verileri
```
