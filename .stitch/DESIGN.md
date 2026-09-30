---
name: Avcıkoru Santrali Motor Bakım Merkezi
colors:
  background: '#0f1319'
  surface: '#171d25'
  surface-elevated: '#1f2730'
  border: '#2a323c'
  border-strong: '#374252'
  text: '#eef1f5'
  text-muted: '#b3bdc8'
  text-faint: '#8f9ba8'
  primary-amber: '#e8952f'
  accent-teal: '#3fb5c4'
  error-red: '#ef4a52'
  warning-orange: '#f2994a'
  caution-yellow: '#f0c93d'
  success-green: '#33c98a'
  light-background: '#f3f6f8'
  light-surface: '#ffffff'
  light-text: '#17212b'
  light-primary-amber: '#b96812'
  light-accent-teal: '#087f8d'
typography:
  display:
    fontFamily: Barlow Condensed
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 1.1
    letterSpacing: 0.04em
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 1.5
    letterSpacing: '0'
  body-small:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 1.45
    letterSpacing: '0'
  data:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 1.2
    letterSpacing: '-0.01em'
rounded:
  sm: 0.375rem
  DEFAULT: 0.5rem
  md: 0.75rem
  card: 0.875rem
  lg: 1rem
  xl: 1.5rem
  2xl: 2rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  page-mobile: 16px
  page-desktop: 24px
---

# Design System: Avcıkoru Santrali Motor Bakım Merkezi

## 1. Visual Theme & Atmosphere

Bu ürün, enerji santrali ve motor bakım operasyonlarını izlemek için tasarlanmış **koyu, yüksek kontrastlı ve görev odaklı bir operasyon arayüzüdür**. Genel atmosfer teknik bir kontrol odasını çağrıştırır: koyu lacivert-siyah bir zemin, katmanlı paneller, ince sınırlar ve amber/teal sinyal renkleri yoğun veri ekranını düzenler. 30 sayfalık uygulama yüzeyi ve 43 civarında yeniden kullanılabilir bileşen, arayüzün pazarlama sitesinden çok günlük saha ve yönetim iş akışlarına göre optimize edildiğini gösterir.

Görsel dilde derinlik ağır gölgelerden çok **panel katmanları, ince border'lar, backdrop blur ve küçük hover hareketleriyle** oluşturulur. Amber, eylem ve dikkat rengidir; teal, bilgi/başarı ve ikincil aksiyonları taşır; kırmızı, turuncu, sarı ve yeşil bakım durumlarını kodlar. Mobilde sabit alt navigasyon, masaüstünde sabit sidebar kullanılması, eldivenli saha kullanımı ve kısa görev döngüleri için doğru bir yapısal karardır.

## 2. Color Palette & Roles

### Primary Foundation

| Token | Hex | Karakter ve kullanım |
|---|---|---|
| **Deep Control Background** | `#0f1319` | Ana koyu zemin, sticky loading yüzeyleri ve uygulamanın temel atmosferi. |
| **Panel Slate** | `#171d25` | Kart, form, modal ve içerik yüzeylerinin ana rengi. |
| **Elevated Slate** | `#1f2730` | İkincil yüzey, input zemini, hover ve seçili alt katman. |
| **Border Slate** | `#2a323c` | Varsayılan hairline sınır; neredeyse tüm kart ve kontrollerde tekrar ediyor. |
| **Strong Border** | `#374252` | Hover/aktif durumda daha belirgin sınır. |

Açık tema varyantı `:root.light` altında ayrıca tanımlıdır: `#f3f6f8` zemin, `#ffffff` panel, `#e8eef2` yükseltilmiş yüzey ve `#17212b` ana metin. Bu, ürünün tema geçişine hazır olduğunu gösterir; ancak tüm ekranların ve bildirimlerin açık temada eşit şekilde doğrulanması gerekir.

### Accent & Interactive

| Token | Hex | Karakter ve kullanım |
|---|---|---|
| **Safety Amber** | `#e8952f` | Birincil CTA, aktif nav, odak halkası, bakım tamamlama ve kritik dikkat. Sıcak ve enerjik ana marka aksanı. |
| **Information Teal** | `#3fb5c4` | İkincil CTA, bilgi mesajı, form focus, grafik ve pozitif etkileşim. |
| **Soft Amber** | `#f0a23f` | Gradient butonların üst tonu ve daha parlak vurgu. |

### Typography & Text Hierarchy

| Token | Hex | Kullanım |
|---|---|---|
| **Primary Text** | `#eef1f5` | Başlık, ana veri ve yüksek öncelikli içerik. |
| **Muted Text** | `#b3bdc8` | Açıklama, metadata ve ikincil etiketler. |
| **Faint Text** | `#8f9ba8` | Yardımcı metin, tarih, placeholder ve düşük öncelik. |

### Functional States

| Token | Hex | Kullanım |
|---|---|---|
| **Error / Overdue Red** | `#ef4a52` | Gecikmiş durum, silme ve hata. |
| **Warning Orange** | `#f2994a` | Kritik bakım ve uyarı. |
| **Caution Yellow** | `#f0c93d` | Yaklaşan bakım ve orta öncelikli uyarı. |
| **Success Green** | `#33c98a` | Normal durum ve yönetici teyidi. |

Renkler çoğunlukla `bg-* / text-* / border-*` Tailwind token'larıyla kullanılıyor; ancak kaynakta ayrıca **126 ayrı hex değeri** ve çok sayıda inline renk bulunuyor. Bu, token sisteminin güçlü ama tam merkezi olmadığını gösterir.

## 3. Typography Rules

### Hierarchy & Weights

- **Inter** gövde, form, navigasyon, açıklama ve çoğu UI metninin temel ailesidir. CSS'te 400, 500, 600, 700 ve 800 ağırlıkları yüklenir.
- **Barlow Condensed** (`font-display`) marka başlıkları, sayfa başlıkları ve uppercase bölüm başlıklarında kullanılır. Yoğunlaştırılmış karakter, operasyonel panel estetiğini güçlendirir.
- **JetBrains Mono** (`font-mono`) saat, kW, sayısal metrikler ve istatistiklerde kullanılır; teknik veri ile normal UI metnini net biçimde ayırır.
- Sayfa başlıkları genellikle `text-xl`–`text-3xl`, bölüm başlıkları `text-lg`, gövde metni çoğunlukla `text-xs`–`text-sm` aralığındadır. Status label'ları ve metadata için 9–11px seviyesine kadar inilmiştir.
- Başlıklarda uppercase, `tracking-wide`/`tracking-[0.16em]` ve yüksek ağırlık; veride monospace ve sıkı tracking; açıklamalarda daha düşük kontrast ve rahat line-height tercih edilir.

### Spacing Principles

- Sistem pratikte **4px tabanlı bir ritim** kullanıyor: `gap-1`, `1.5`, `2`, `2.5`, `3`, `4` ve bunların responsive varyantları yaygın.
- En sık görülen yatay iç boşluklar `px-2.5`, `px-3`, `px-4`; dikey kontrol boşlukları `py-2`, `py-2.5`, `py-3`.
- Mobil sayfa kenarı çoğunlukla `16px`; masaüstü içerik kabı `max-w-5xl` ve sidebar için `md:ml-64` kullanır.
- Veri yoğunluğu yüksek olsa da kart içi padding genellikle `p-3`/`p-3.5`/`p-4` seviyesinde tutulur.

## 4. Component Stylings

### Buttons

- Birincil butonlar amber gradient veya solid amber (`#e8952f`) kullanır; koyu kahverengi metinle yüksek kontrast oluşturur. Teal butonlar ikincil/pozitif işlemlerde kullanılır.
- Form ve bakım eylemlerinde `rounded-lg` veya `rounded-xl`, `py-2.5`–`py-3.5`, bold/extrabold metin ve `hover:brightness-110` standardı görülür.
- Hover'da parlaklık, border rengi veya hafif scale (`active:scale-[.98]`) değişir. Odak için global `2px` amber outline ve bazı kontrollerde teal ring vardır.
- Silme ve riskli işlemler kırmızı border veya kırmızı solid butonla ayrılır; yeşil teyit butonu olumlu iş akışını belirtir.

### Cards & Containers

- Ana kart standardı `bg-panel border border-border rounded-card`, yani `#171d25`, `#2a323c` ve `14px` köşedir.
- Dashboard kartlarında hover border güçlenir ve bazı kartlar `-translate-y-0.5` ile hafifçe yükselir. `shadow-lg` ve `shadow-black/10` seçici biçimde kullanılır.
- Login paneli ve bazı modal yüzeyleri `bg-panel/70`, `backdrop-blur-xl`, gradient veya ağır gölgeyle daha yüksek katman hissi verir.
- İçerik kartlarında medya, durum etiketi, metadata, ölçüm satırları ve eylem butonları sıralı biçimde paketlenir; `MaintenanceRecordCard` bu domain deseninin ana örneğidir.

### Navigation

- Masaüstünde `md:flex`, `fixed`, `w-64`, `bg-bg/95`, `backdrop-blur-xl` ve sağ border'lı sabit sidebar bulunur.
- Mobilde sabit alt navigasyon `md:hidden`, `backdrop-blur-xl`, üst border ve safe-area padding ile çalışır. Aktif öğe amber metin ve kısa alt çizgiyle gösterilir.
- Aktif sidebar öğesi `border-amber/20 bg-amber/10 text-amber`; pasif öğe muted metin ve panel hover ile ayrılır.
- Navigasyon ikonları çoğunlukla emoji karakterleridir. Bu yaklaşım hızlı ve sıcak olsa da platformlar arası ölçü/renk farkı ve erişilebilirlik tutarsızlığı yaratır.

### Inputs & Forms

- Input'lar genelde `bg-panel2`, `border-border`, `rounded-lg`/`rounded-xl`, `px-3`/`px-4`, `py-2`/`py-3` ile tasarlanır.
- Focus durumunda teal veya amber border, çoğu önemli formda teal ring kullanılır.
- Label'lar küçük, bold, uppercase ve tracking'li; placeholder rengi `text-faint` olarak daha düşük kontrastlıdır.
- `DurationInput` gibi domain kontrollerinde monospace numeric input kullanımı doğru bir veri-giriş desenidir.

### Domain-Specific Components

- **Bakım durum özetleri:** Dört durum `gecikmis / kritik / yaklasiyor / normal` olarak kırmızı, turuncu, amber ve yeşille ayrılır; küçük nokta, label ve sayı kombinasyonu kullanılır.
- **Motor sağlık kartları:** Yüzde skor, renkli progress bar, durum etiketi ve attention sayısını tek tıklanabilir kartta birleştirir.
- **Bakım kayıt kartı:** Fotoğraf/video önizleme, motor/bakım türü, teknisyen, çalışma saati, basınç, not, teyit ve düzenle/sil eylemlerini tek bir yoğun ama hiyerarşik yüzeyde sunar.
- **Charts/gauges:** Teal ve amber çizgiler, monospace değerler ve koyu panel zeminiyle teknik telemetriyi destekler.

## 5. Layout Principles

### Grid & Structure

- Uygulama Next.js App Router, Tailwind CSS 3.4 ve yaklaşık 30 route üzerine kuruludur.
- Varsayılan içerik kabı `max-w-5xl`, özel yetkilendirme çalışma alanı `w-full` kullanır. Desktop'ta sidebar sonrası `md:ml-64` içerik alanı bulunur.
- Dashboard'da mobil `grid-cols-2`, desktop `md:grid-cols-4`; motor sağlık detaylarında mobil tek kolon, desktop `md:grid-cols-2` kullanılır.
- Geniş rapor/tablolar için `max-w-7xl`, `max-w-[1500px]` ve özel grid kolonları gibi istisnalar vardır.

### Whitespace Strategy

- Mobil-first yaklaşım baskındır: sayfa ve kart boşlukları küçük ekran için sıkı, `md:` ile masaüstünde genişler.
- Header ve bottom nav sabittir; içerik, bottom nav için `h-24` boşluk ve mobil safe-area padding ile korunur.
- Bölüm başlıkları border-bottom, margin-top ve margin-bottom ile ayrılır; dashboard'da `mt-5 mb-3 pb-2` benzeri tekrar eden bir section ritmi vardır.
- Arayüz bilgi yoğunluğunu korurken kartlarda yeterli `p-3`/`p-4` tamponu kullanır.

### Alignment & Visual Balance

- Operasyonel veriler çoğunlukla sola hizalı; sayısal metrikler ve durum skorları sağa/monospace hizalanır.
- Dashboard karşılama paneli başlık + açıklama + durum meta satırını, üstteki dekoratif daire ve ikonla dengeler.
- Renkli accent'ler küçük alanlarda kullanılır: sol dikey status bar, nokta, progress gradient, aktif çizgi. Böylece koyu yüzeyler baskın kalır.

### Responsive Behavior & Touch

- Breakpoint kullanımı ağırlıklı olarak `sm`, `md`, `lg`, `xl`, `2xl` varsayılan Tailwind eşikleridir; en yoğun eşik `md`'dir.
- Mobil navigasyon ve masaüstü sidebar birbirinin karşılığıdır. Form eylemleri küçük ekranda ters kolon sıralamasıyla daha kullanılabilir hale gelir.
- Birçok kontrol 40–52px dikey ölçüye ulaşsa da bazı küçük status/metadata hedefleri 32px'in altına iner; bunlar bilgi göstergesi olarak kalmalı, etkileşimli kontrole dönüşmemelidir.

## 6. Design System Notes for Stitch Generation

### Language to Use

“Koyu endüstriyel operasyon paneli”, “derin slate paneller”, “ince soğuk gri sınırlar”, “amber birincil aksiyon”, “teal bilgi vurgusu”, “Inter okunabilir gövde”, “Barlow Condensed uppercase bölüm başlığı”, “JetBrains Mono teknik metrik”, “hafif blur ve katmanlı yüzeyler”, “yüksek kontrastlı bakım durumu” ifadelerini kullan.

### Color References

- Zemin: Deep Control Background `#0f1319`
- Ana panel: Panel Slate `#171d25`
- Yükseltilmiş panel: Elevated Slate `#1f2730`
- Birincil aksiyon: Safety Amber `#e8952f`
- Bilgi/ikincil aksiyon: Information Teal `#3fb5c4`
- Ana metin: `#eef1f5`; ikincil: `#b3bdc8`; yardımcı: `#8f9ba8`
- Durumlar: red `#ef4a52`, orange `#f2994a`, yellow `#f0c93d`, green `#33c98a`

### Component Prompts

1. “Mobil-first koyu bakım dashboard'u üret: üstte sticky başlık, iki kolonlu bakım durum özet kartları, amber/teal accent'ler, monospace kW değerleri, yuvarlatılmış slate kartlar ve altta sabit 5 öğeli mobil navigasyon.”
2. “Motor bakım kaydı kartı tasarla: koyu panel, ince border, üstte motor adı ve teyit pill'i, ortada tarih/çalışma saati/teknisyen metadata'sı, medya thumbnail'leri ve altta Detay–Düzenle–Sil eylemleri; kırmızı yalnızca riskli silme eyleminde görünsün.”
3. “Masaüstü operasyon ekranı tasarla: solda 256px sabit sidebar, active nav amber, sağda max-width içerik, sticky TopBar, koyu slate yüzeyler, teal form focus ve amber birincil kaydet butonu.”

### Incremental Iteration

- Yeni ekranlarda önce mevcut token'ları kullan; yeni hex değer eklemeden önce `globals.css` ve Tailwind renk uzantısını güncelle.
- CTA, bilgi, başarı ve risk renklerini birbirine karıştırma; her yeni durum için semantik token tanımla.
- Yeni bileşenlerde `rounded-card`, `border-border`, `bg-panel`, `bg-panel2`, `text-text`, `text-muted` ve `text-faint` başlangıç setini kullan.
- Mobil 360px genişlikte ve masaüstü 1280px genişlikte doğrula; alt navigasyon, safe-area ve modal taşmalarını özellikle test et.
- Teknik veri ile açıklama metnini ayırmak için monospace yalnızca ölçüm/sayı bağlamında kullan; normal açıklamalarda Inter'e dön.
