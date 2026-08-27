export const CHECKLIST_TEMPLATES = {
  yag: ["Yağ seviyesi ve kaçak kontrolü", "Filtre ve bağlantı kontrolü", "Çalışma sonrası tekrar kontrol"],
  krank: ["Fark basıncı ölçümü", "Filtre yüzeyi kontrolü", "Bağlantı ve kaçak kontrolü"],
  intercooler: ["Fark basıncı ölçümü", "Hortum ve kelepçe kontrolü", "Soğutucu yüzey kontrolü"],
  alternator: ["Kablo ve bağlantı kontrolü", "Görsel hasar kontrolü", "Çalışma testi"],
  default: ["Görsel genel kontrol", "Bakım işlemi tamamlandı", "Çalışma sonrası kontrol"],
};

export function checklistForType(typeKey: string, label?: string): string[] {
  const normalized = `${typeKey} ${label || ""}`.toLocaleLowerCase("tr");
  if (normalized.includes("yağ")) return CHECKLIST_TEMPLATES.yag;
  if (normalized.includes("krank")) return CHECKLIST_TEMPLATES.krank;
  if (normalized.includes("intercooler")) return CHECKLIST_TEMPLATES.intercooler;
  if (normalized.includes("alternat")) return CHECKLIST_TEMPLATES.alternator;
  return CHECKLIST_TEMPLATES.default;
}
