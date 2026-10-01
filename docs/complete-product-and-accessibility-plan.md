# 20+ Maddelik Tamamlama Planı

## Kapsam

Bu çalışma, mevcut tasarım korunarak erişilebilirlik, tasarım sistemi ve ürün fırsatlarını tamamlar. Rol bazlı teknisyen dashboard'ı kapsam dışıdır.

## Fazlar

1. Erişilebilirlik: klavye/focus, modal trap/return, status semantiği, kontrast tokenları, alan bazlı hata ilişkileri ve statik ekran okuyucu sözleşmeleri.
2. Görsel sistem: emoji temizliği, AppIcon kullanımı, ortak buton/radius/spacing/shadow/border/font tokenları.
3. Ürün: takvim, motor geçmişi/trend, Excel önizleme doğrulaması, gecikme nedeni raporu, teknisyen performansı, QR hızlı başlatma, ek önizleme, yönetici teyidi, gelişmiş audit araması ve dashboard aksiyonları.
4. Doğrulama: typecheck, lint, test, production build, bağımsız kaynak incelemesi, commit ve push.

## Dağıtım kararı

Mevcut Next.js uygulaması, kişiselleştirilmiş ekranlar ve API'ler nedeniyle mevcut uygulama sunucusu modeli korunur. Bu turda yayın/route konfigürasyonu değiştirilmez; API cevapları kişisel ve `no-store` davranışını korur.

## Kapsam notu

Gerçek ekran okuyucu cihaz testi bu sandbox içinde fiziksel kullanıcı cihazı olmadan kaynak sözleşmeleri ve semantik HTML üzerinden doğrulanır; teslim raporunda bu kanıt sınırı ayrıca belirtilir.
