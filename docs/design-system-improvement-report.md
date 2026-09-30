# Tasarım Sistemi Gelişim Raporu

**Proje:** Avcıkoru Santrali Motor Bakım Merkezi  
**İncelenen teknoloji:** Next.js 16.3.3, React 19, Tailwind CSS 3.4  
**Kapsam:** `app/`, `components/`, `tailwind.config.ts`, `app/globals.css`, root layout ve seçili domain bileşenleri  
**İnceleme tarihi:** 30 Eylül 2026

## Yönetici özeti

Proje, saha ve bakım operasyonları için doğru bir görsel yönde ilerliyor: koyu endüstriyel zemin, amber aksiyon rengi, teal bilgi rengi, sabit masaüstü sidebar'ı ve mobil bottom navigation net bir ürün karakteri oluşturuyor. Token'ların `globals.css` ve Tailwind uzantısında toplanmış olması, tasarım sistemi için iyi bir temel.

Bununla birlikte sistem henüz tam anlamıyla merkezi bir tasarım sistemi değil. Bileşenlerde **126 benzersiz doğrudan hex kullanımı**, tekrar eden gradient renkleri, çok sayıda özel text boyutu ve bazı ekranlarda farklı renk kontratları var. En yüksek getirili çalışma; renk/ölçü token'larını tek kaynağa taşımak, ortak UI primitive'lerini standardize etmek ve açık tema/erişilebilirlik doğrulamasını tamamlamak olacaktır.

## Bulgular ve kanıtlar

### Güçlü yönler

- `app/globals.css` içinde dark/light tema için temel yüzey, metin, border ve durum token'ları mevcut.
- `tailwind.config.ts` semantic renk isimlerini CSS değişkenlerine bağlıyor: `bg`, `panel`, `panel2`, `border`, `text`, `muted`, `amber`, `teal`, `red`, `orange`, `yellow`, `green`.
- `rounded-card: 14px` ile kart köşesi için ortak bir token var.
- `Inter`, `Barlow Condensed` ve `JetBrains Mono` ayrımı marka başlığı, gövde ve teknik veri için anlamlı.
- `components/AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx` ve `BottomNav.tsx` responsive kabuk desenini tutarlı biçimde kuruyor.
- Global `focus-visible` outline, safe-area padding, loading skeleton'ları, hover/focus durumları ve role-based navigation olumlu erişilebilirlik/UX sinyalleri.

### Gelişim alanları

1. **Renk tek kaynağı eksik**
   - `globals.css` token'larına ek olarak bileşenlerde 126 ayrı hex kullanımı bulunuyor.
   - `#f0a23f`, `#1a1206`, `#06181b`, `#071a12`, `#232d3a` gibi değerler farklı dosyalarda tekrar ediyor.
   - Bazı loading ekranları doğrudan `bg-[#0f1319]` kullanıyor; token değiştiğinde bunlar otomatik güncellenmeyecek.

2. **Tipografi ölçeği dağınık**
   - 9–11px metadata ve label kullanımı çok yaygın; yoğun veri ekranında kabul edilebilir olsa da uzun süreli saha kullanımında okunabilirlik riski taşır.
   - `font-body` tanımlı olsa da global gövde fontu doğrudan CSS'te `Inter` olarak yazılı; token ile gerçek kullanım arasında küçük bir kopukluk var.
   - Headline, body, label ve data için isimlendirilmiş tipografik sınıflar bulunmuyor; her sayfa Tailwind utility kombinasyonunu yeniden kuruyor.

3. **Bileşen primitive'leri tam standardize değil**
   - Butonlar genelde aynı görsel dili paylaşsa da `rounded-lg`/`rounded-xl`, `py-2.5`/`py-3`/`py-3.5`, gradient/solid ve farklı koyu metin hex'leri arasında varyasyon var.
   - Input, modal, card, badge ve button desenleri için ortak React primitive'leri görünmüyor; bu durum yeni ekranlarda drift yaratabilir.
   - `StatusPill` CSS tabanlı iken diğer durum göstergeleri inline Tailwind sınıflarıyla kuruluyor.

4. **İkon dili tutarsız**
   - Sidebar ve bottom navigation büyük ölçüde emoji kullanıyor (`📊`, `⚙️`, `✅`, `☰`). Emoji'ler işletim sistemi ve fonta göre farklı görünür; renk ve hizalama kontrolü düşüktür.
   - SVG/icon setine geçiş, özellikle bakım durumları, medya, silme ve navigasyon için daha kararlı sonuç verir.

5. **Açık tema kapsaması doğrulanmalı**
   - Light token'lar tanımlı; fakat root layout'taki `Toaster` sabit `theme="dark"` kullanıyor.
   - Bazı sabit koyu renkler (`#0f1319`, `#12161d`, `#232d3a`) açık temada da kalabilir.
   - PDF/print çıktıları ayrı, bilinçli bir yüzey kullanıyor; bu ayrım korunmalı ancak web ekranlarıyla token ilişkisi belgelenmeli.

6. **Erişilebilirlik ve okunabilirlik**
   - Global focus görünürlüğü güçlü bir başlangıç.
   - 9–10px label'lar, faint metin ve düşük opaklıklı status arka planları kontrast testi gerektiriyor.
   - Emoji-only ikonların anlamı metinle destekleniyor olsa da ikonların `aria-hidden`/accessible name yaklaşımı standardize edilmeli.
   - Etkileşimli kartlar ve küçük eylem butonları için minimum 44–48px dokunma hedefi kontrol edilmeli.

## Önceliklendirilmiş öneriler

### P0 — hızlı ve yüksek etkili

| Öneri | Beklenen etki | Uygulama yaklaşımı |
|---|---|---|
| Semantic color token'larını genişlet | Tema değişikliği ve marka revizyonu kolaylaşır | `--color-amber-strong`, `--color-on-amber`, `--color-danger-on`, `--color-focus`, gradient durakları ve scrim token'ları ekle; ham hex'leri kaldır. |
| Ortak Button/Badge/Input/Card primitive'leri oluştur | Yeni ekranlarda görsel drift azalır | `components/ui/` altında variant ve size API'si tanımla; mevcut sınıfları kademeli olarak taşı. |
| Tipografik roller tanımla | Okunabilirlik ve tasarım tutarlılığı artar | `text-display`, `text-section`, `text-body`, `text-caption`, `text-data` sınıfları veya CSS layer utility'leri ekle. |
| Light theme smoke test'i ekle | Tema geçişinde kırılma riski azalır | Login, dashboard, kayıtlar, form, modal, bottom nav ve toaster'ı iki temada kontrol et. |

### P1 — orta vadeli kalite

| Öneri | Beklenen etki | Uygulama yaklaşımı |
|---|---|---|
| Emoji'leri ikon sistemine taşı | Platformlar arası tutarlılık ve erişilebilirlik | Lucide benzeri tek SVG seti seç; ikon boyut, stroke ve label kurallarını belgeleyip nav/status/media'da uygula. |
| Spacing ve radius ölçeğini daralt | Görsel ritim daha hızlı öğrenilir | 4/8/12/16/24/32 ölçeğini temel al; `p-3.5`, özel `text-[10.5px]` gibi değerleri yalnızca gerekçeli istisna yap. |
| Status modelini tek primitive'e birleştir | Durum renkleri ve metinleri tek yerde yönetilir | `StatusPill`, dashboard score bar ve stat card aynı semantic status map'ten beslensin. |
| Görsel regresyon kontrolü kur | Responsive drift erken yakalanır | Playwright ile 360, 768, 1280 viewport screenshot'ları; dark/light ve temel route matrisi. |

### P2 — stratejik iyileştirme

| Öneri | Beklenen etki | Uygulama yaklaşımı |
|---|---|---|
| Tasarım token'larını kaynak dosyaya çıkar | CSS/Tailwind/rapor çıktısı arasında uyum | `lib/design-tokens.ts` veya JSON token kaynağı oluştur; CSS değişkenlerini ve Tailwind config'i buradan üret. |
| Component documentation ekle | Takım onboarding'i ve tekrar kullanım artar | Storybook benzeri küçük bir `/design-system` route'u veya MDX katalog; button, input, card, status, nav varyantları. |
| Kontrast ve motion bütçesi tanımla | Saha koşullarında daha güvenli kullanım | WCAG kontrast kontrolü, `prefers-reduced-motion`, animasyon süreleri ve focus ring standartları. |
| Veri yoğun ekranlar için yoğunluk modları düşün | Kullanıcı tercihi ve farklı ekran boyutları desteklenir | Compact/comfortable density seçeneği; tablo ve kayıt kartlarının padding/font ölçeğini kontrollü değiştir. |

## Somut hedef token seti

Aşağıdaki ek token'lar mevcut sistemi bozmadan dağınık kullanımı azaltabilir:

```css
:root {
  --color-on-amber: #1a1206;
  --color-on-teal: #06181b;
  --color-on-green: #071a12;
  --color-surface-deep: #12161d;
  --color-brand-amber-bright: #f0a23f;
  --color-danger-bright: #ff7a7f;
  --color-focus: var(--color-amber);
  --color-scrim: rgba(0, 0, 0, .75);
  --radius-control: 12px;
  --radius-card: 14px;
  --space-page: 16px;
}
```

Ardından `text-[#1a1206]`, `text-[#06181b]`, `bg-[#12161d]` ve tekrar eden gradient başlangıçlarını semantic utility'lere dönüştürmek gerekir.

## Önerilen uygulama sırası

1. Ham renk ve font kullanımını raporlayan basit bir lint/check script'i ekle.
2. Yeni token'ları `globals.css` + `tailwind.config.ts` içine ekle.
3. Button, Input, Card ve Status primitive'lerini oluştur; login ve dashboard'da pilotla.
4. Pilot ekranları dark/light ve 360/1280 viewport'larda doğrula.
5. Sidebar/bottom nav emoji'lerini tek ikon setiyle değiştir.
6. Form ve durum ekranlarında 10px altı metinleri azalt; kontrast ölç.
7. Kalan route'ları kademeli taşı, sonra doğrudan hex kullanımını CI'da sınırla.

## Başarı ölçütleri

- Uygulama kaynaklarında yeni doğrudan hex eklenmemesi; mevcut 126 benzersiz değerin büyük bölümünün semantic token'lara indirilmesi.
- Button, input, card ve status varyantlarının en az %80'inin ortak primitive'lerden gelmesi.
- Dark/light temada kritik route'larda görsel ve işlevsel smoke test'in geçmesi.
- Etkileşimli kontrollerde minimum 44px dokunma hedefi; body/caption metinlerinde tanımlı alt sınır.
- 360px ve 1280px viewport screenshot'larında yatay taşma, bottom-nav çakışması ve modal kesilmesi olmaması.

## Sonuç

Evet, yapılabilecek anlamlı gelişmeler var; ancak temel görsel yönü değiştirmek gerekmiyor. En doğru strateji mevcut **koyu operasyon paneli + amber/teal sinyal dili**ni koruyup bunu daha merkezi, ölçülebilir ve erişilebilir hale getirmek. Öncelik yeni bir tema aramak değil, zaten oluşmuş dili token'lar ve ortak bileşenler üzerinden disipline etmektir.


## Uygulama durumu — 30 Eylül 2026

Raporun uygulanabilir önerileri, mevcut görünüm ve davranış korunarak kod tabanına işlendi:

- Semantic renk token'ları genişletildi: panel deep, amber bright, on-amber, on-teal, on-red ve on-green.
- Tekrarlanan buton/input/card desenleri için `ui-button`, `ui-control`, `ui-card` ve `ui-caption` primitive sınıfları eklendi.
- Login ekranı ortak `Button` primitive'ine ve semantic input sınıflarına taşındı.
- Tema değişimine duyarlı `AppToaster` eklendi; light theme'de toast'lar artık koyu sabit tema kullanmıyor.
- `prefers-reduced-motion` desteği eklendi.
- Sidebar, bottom navigation, logout, tema geçişi ve dashboard status kartlarındaki platform bağımlı emoji ikonları ortak SVG `AppIcon` bileşenine taşındı.
- Tekrarlanan hardcoded utility renkleri semantic Tailwind token'larına dönüştürüldü; PDF/print gibi bilinçli dışa aktarma yüzeyleri değiştirilmedi.
- Tasarım sistemi sözleşme testleri eklendi: `tests/design-system-contract.test.mts`.

### Doğrulama

- `npm run typecheck` — başarılı
- `npm run lint` — başarılı
- `npm test` — **173 test başarılı**
- `npm run build` — izole preview değişkenleriyle başarılı; **32 route** derlendi
- `git diff --check` — başarılı

Build doğrulamasında gerçek veri erişimi için gereken `MONGO_URI` ve `JWT_SECRET` eksik olduğu için, yalnızca derleme doğrulamasına özel yerel Mongo URI ve preview JWT secret kullanıldı; üretim secret'ları değiştirilmedi.
