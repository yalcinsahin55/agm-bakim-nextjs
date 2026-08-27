export const WRITE_REQUEST_PATTERNS = [
  /\b(oluştur|oluşturur musun|ekle|kaydet|sil|siler misin|düzenle|değiştir|güncelle|ata|atama yap|onayla|reddet|tamamla|bildirim gönder|mesaj gönder|yedek al|geri yükle)\b/iu,
  /\b(patch|post|put|delete|insert|update|drop|mongo(db)?|veritabanı sorgusu|api anahtarı)\b/iu,
];

export const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/iu,
  /previous\s+instructions?/iu,
  /system\s+prompt/iu,
  /developer\s+message/iu,
  /jailbreak|dan\s+mode|do anything now/iu,
  /kuralları\s*(yok say|atla|çiğne)/iu,
  /talimatları\s*(yok say|unut|atla)/iu,
  /gizli\s+(kurallar|prompt|talimat)/iu,
];

export const SENSITIVE_DATA_PATTERNS = [
  /(?:^|[^\p{L}\p{N}_])(?:şifre\p{L}*|parola\p{L}*|password\p{L}*|token\p{L}*|secret\p{L}*|api\s*key\p{L}*|private\s*key\p{L}*|vapid\p{L}*)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:telefon numarası|e-?posta adresi|email adresi|kişisel veri|kimlik numarası)/iu,
  /(?:^|[^\p{L}\p{N}_])(?:audit\s+log\p{L}*|işlem\s+geçmişi\s+kayıtlarının\s+tamamı\p{L}*|ham\s+medya\p{L}*|base64\p{L}*)(?=$|[^\p{L}\p{N}_])/iu,
];

export const UNSAFE_DIAGNOSIS_PATTERNS = [
  /kesin\s+(arıza|teşhis|neden)/iu,
  /arıza\s+(nedeni|teşhisi)\s+(nedir|ne|koy)/iu,
  /tamir\s+(et|talimatı|nasıl)/iu,
  /motor\s+(kesinlikle|mutlaka)\s+(bozuk|arızalı)/iu,
];

export const QUESTION_HELP_PATTERNS = [
  /ne\s+yapabilirsin/iu,
  /\byardım\b/iu,
  /hangi\s+(sorular|sorgular)/iu,
  /nasıl\s+çalış/iu,
];

export const EXTERNAL_SERVICE_PATTERNS = [
  /dış\s+hizmet/iu,
  /harici\s+servis/iu,
  /garanti/iu,
  /dış\s+servis/iu,
  /servisten\s+hizmet/iu,
  /servis\s+firması/iu,
  /servisi?\s+(?:hangi|kaç|nerede|tarafından)/iu,
];

export const MOTOR_PERFORMANCE_PATTERNS = [
  /\bmotor(?:lar|ların|ların)?\s+performans(?:ı|ı|ları|larını)?/iu,
  /\bperformans(?:ı|ları|larını)?\b[^?]{0,50}\bmotor(?:lar|ların|ları)?\b/iu,
  /\bmotor(?:lar|ların|ları)?\b[^?]{0,80}\b(?:gün\s+gün|ortalama|yük(?:ü|leri)?|çalışma\s+saat(?:i|leri)?)\b[^?]{0,40}\b(?:nasıl|nasıldı|ne|kaç)/iu,
];

export const TECHNICIAN_PATTERNS = [
  /teknisyen/iu,
  /personel\s+performans/iu,
  /performans/iu,
  /çalışma\s+süresi/iu,
  /teknisyen\s+görevi/iu,
  /hangi\s+bakımlarda?\s+(çalış|görev)/iu,
  /hangi\s+motorlarda?\s+(çalış|görev)/iu,
  /hangi\s+(bakım|motor|iş).*?(çalış|görev)/iu,
  /(?:yardımcı|destek)\s+(?:olarak\s+)?çalış/iu,
  /['’](?:in|ın|ün|un|nin|nın|nün|nun)\s+.{0,80}\bbakım/iu,
  /en\s+(çok|fazla)\s+(çalış|görev)/iu,
  /kim\s+(en\s+çok\s+)?(çalıştı|çalışmış|görev\s+(aldı|yaptı))/iu,
  /\bne\s+kadar(?:\s+süre)?\s+(?:çalıştı|çalışmış|çalışmıştır)/iu,
  /\b(?:toplam|kaç)\s+saat\s+(?:çalıştı|çalışmış)/iu,
];

export const FORECAST_PATTERNS = [
  /(?:gelecek|önümüzdeki|bir sonraki)\s+yıl.*(?:bakım|bakımları|bakımların)/iu,
  /(?:hangi|planlanan|tahmini|öngörülen).{0,100}\b bakım(?:lar|ları)?\b.{0,100}(?:gelecek|yapılacak|planlan|öngör)/iu,
  /\b(?:20\d{2}|21\d{2})\b['’]?(?:de|da|te|ta|yılında|yılına|için)?[^?]{0,100}(?:planlanan|tahmini|öngörülen|gelecek|yapılacak|planlan).{0,80}\bbakım/iu,
  /\bbakım(?:lar|ları)?\b[^?]{0,100}\b(?:20\d{2}|21\d{2})\b[^?]{0,100}(?:gelecek|yapılacak|planlan|tahmin)/iu,
  /bakım\s+tarihi\s+tahmini/iu,
];

export const OVERDUE_PATTERNS = [
  /gecikmiş/iu,
  /geciken/iu,
  /gecikme/iu,
  /vadesi\s+geç/iu,
  /acil\s+bakım/iu,
  /kritik\s+(?:bakım|motor)/iu,
  /yaklaşan\s+(?:bakım|bakımlar)/iu,
  /normal\s+(?:bakım|durum)/iu,
];

export const ENGINE_HISTORY_PATTERNS = [
  /son\s+bakım/iu,
  /bakım\s+geçmiş/iu,
  /motor\s+\S+/iu,
  /(?:yapılan|yapılmış|tamamlanan|gerçekleşen)\s+bakım(?:lar|ları)?/iu,
  /(?:tüm|bütün|hepsi)\s+bakım(?:lar|ları|larını)?/iu,
  /bakım\s+(?:kayıt|rapor)(?:ları|larını)?/iu,
];

export const RECORD_FILTER_PATTERNS = [
  /geriye\s+dönük|sonradan\s+girilen|backdated/iu,
  /başlangıç.*(?:eksik|yok)|bitiş.*(?:eksik|yok)|zaman\s+bilgisi.*(?:eksik|yok)|saat\s+bilgisi.*(?:eksik|yok)/iu,
  /(?:teyit|teyidi)\s*(?:edilmemiş|bekleyen|yok|olmayan)|onaylanmamış|doğrulanmamış/iu,
];

export const ENGINE_DATA_PATTERNS = [
  /çalışma\s+saat(?:i|leri)?/iu,
  /motor\s+saat(?:i|leri)?/iu,
  /kaç\s+saat\s+(?:çalış|çalışıyor|çalışmış)/iu,
  /yük(?:ü|\s+bilgisi|\s+değeri)/iu,
  /motor\s+(?:durumu|bilgileri)/iu,
  /motor(?:lar|ların)?\s+(?:çalışma\s+)?saat(?:i|leri)?/iu,
];

export const MAINTENANCE_CATALOG_PATTERNS = [
  /bakım\s+tür(?:ü|leri)(?:nin)?\s+(?:listesi|neler|hangileri|sayısı|tanımlı|var|mevcut|periyot|listele|göster|getir)/iu,
  /tanımlı\s+bakım/iu,
  /hangi\s+bakımlar?\s+(?:tanımlı|var|mevcut)/iu,
  /bakım\s+periyod(?:u|ları)/iu,
  /periyot(?:u|ları)?\s+(?:kaç|nedir|ne|hangi)/iu,
];

export const PRESSURE_PATTERNS = [
  /karter/iu,
  /basınç\s+(?:okuma(?:sı|ları|larını)?|ölç(?:ümü|ümleri|ümlerini)?|değer(?:i|leri|lerini)?|durum(?:u|ları)?)/iu,
  /basınç\s+(?:kaç|nedir|listele|göster|getir)/iu,
];

export const OIL_ANALYSIS_PATTERNS = [
  /yağ\s+analiz/iu,
  /yağ\s+(?:sonucu|raporu|değeri)/iu,
];

export const EQUIPMENT_INFO_PATTERNS = [
  /motor\s+teknik\s+(?:özellik|bilgi|kart)/iu,
  /motor\s+(?:özellik|kart)\b/iu,
  /(?:kaver|hava\s+filtresi|krankcase|eşanjör|dungs|radyatör)/iu,
];

export const TECHNICIAN_DIRECTORY_PATTERNS = [
  /aktif\s+teknisyen/iu,
  /teknisyenler?\s+(?:kimler|listesi|kaç|hangi|hangileri|listele|göster|getir)/iu,
  /mekanik\s+ve\s+elektromekanik\s+teknisyen/iu,
];

export const MAINTENANCE_HEALTH_PATTERNS = [
  /bakım\s+(?:sağlığı|durumu|takibi)/iu,
  /kalan\s+saat(?:i|leri)?/iu,
  /(?:ne\s+kadar|kaç(?:\s+saat)?)\s+kaldı/iu,
  /bakım(?:ı|ını|ları|larını)?\s+[^?]{0,50}\b(?:çalış(?:tı|mış|ılan)?|harcanan)\b/iu,
  /(?:son\s+bakımdan|bakımdan)\s+beri\s+(?:kaç\s+saat|ne\s+kadar)\s+çalış/iu,
  /kritik\s+bakım(?:lar|ları)?/iu,
  /hangi\s+bakım(?:lar|ları)?\s+kritik/iu,
  /hangi\s+motor(?:lar|ların)?\s+(?:kritik|gecikmiş|yaklaşıyor|normal)/iu,
  /motor(?:lar|ların)?\s+hangi\s+bakım(?:larda|ları)?\s+(?:kritik|gecikmiş|yaklaşıyor|normal)/iu,
];

export const NOTIFICATION_PATTERNS = [
  /bildirim/iu,
  /okunmamış\s+(?:uyarı|bildirim)/iu,
  /kaç\s+(?:uyarı|bildirim)/iu,
];

export const SUMMARY_PATTERNS = [
  /özet/iu,
  /kaç\s+bakım/iu,
  /toplam\s+bakım/iu,
  /istatistik/iu,
  /en\s+fazla/iu,
  /bakım\s+sayısı/iu,
  /hangi\s+bakımlar?/iu,
  /bakımlar?\s+(?:hangileri|nelerdir)/iu,
  /en\s+(?:uzun|kısa)\s+süren/iu,
  /hangi\s+bakımlar?\s+(yapıldı|yapılmış|tamamlandı|gerçekleşti)/iu,
  /bakımlar?\s+(yapıldı|yapılmış|tamamlandı|gerçekleşti)/iu,
  /\byapılan\s+bakımlar?\b/iu,
  /bakım\s+tür(?:ü|leri)?\b[^?]{0,80}\b(?:yapıldı|yapılmış|tamamlandı|gerçekleşti)/iu,
  /hangi\s+motorlarda?\s+(?:bakım|çalışma|iş)/iu,
  /hangi\s+motorlarda?\s+.{2,80}\s+bakım/iu,
  /(?:yapılan|yapılmış)\s+motorlar?/iu,
  /bakım\s+türü\s*[:=-]/iu,
];

export const INTERNAL_SOURCE_PATTERNS = [
  /iç\s+(ekip|kaynak|bakım)/iu,
  /kayıtlı\s+teknisyen/iu,
  /dış\s+hizmet\s+(olmayan|hariç)/iu,
];
