import { z, ZodError } from "zod";
import { isAllowedReportAttachmentUrl, isReportAttachmentMime, REPORT_ATTACHMENT_MAX_BYTES, REPORT_ATTACHMENT_MAX_COUNT } from "@/lib/reportAttachments";

// 🔐 Giriş validasyonu. `email` alanı eski istemcilerle geriye dönük uyumludur.
export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Telefon numarası veya e-posta gereklidir.").max(254).optional(),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(30).optional(),
  password: z
    .string({ required_error: "Şifre gereklidir." })
    .min(6, "Şifre en az 6 karakter olmalıdır.")
    .max(128, "Şifre çok uzun."),
}).refine((data) => Boolean(data.identifier || data.email || data.phone), {
  message: "Telefon numarası veya e-posta gereklidir.",
  path: ["identifier"],
});

// 👤 İlk kurulum kaydı. Sistem kurulduktan sonra bu endpoint yeni kayıtları kapatır.
export const registerSchema = z.object({
  full_name: z
    .string({ required_error: "Ad Soyad gereklidir." })
    .trim()
    .min(2, "Ad Soyad en az 2 karakter olmalı.")
    .max(100, "Ad Soyad çok uzun."),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email("Geçerli bir e-posta adresi girin.").max(254).optional(),
  password: z
    .string({ required_error: "Şifre gereklidir." })
    .min(6, "Şifre en az 6 karakter olmalıdır.")
    .max(128, "Şifre çok uzun."),
}).refine((data) => Boolean(data.phone || data.email), {
  message: "Telefon numarası veya e-posta gereklidir.",
  path: ["phone"],
});

const workDomainSchema = z.enum(["mechanical", "electrical", "commissioning"]);

export const adminUserSchema = z.object({
  full_name: z.string().trim().min(2, "Ad Soyad en az 2 karakter olmalı.").max(100),
  phone: z.string().trim().min(5, "Telefon numarası gereklidir.").max(30),
  password: z.string().min(6, "Şifre en az 6 karakter olmalıdır.").max(128),
  role: z.enum(["yonetici", "teknisyen", "goruntuleyici"]).default("teknisyen"),
  technician_type: z.enum(["mekanik", "elektromekanik"]).optional(),
  can_be_responsible: z.boolean().optional(),
  can_be_support: z.boolean().optional(),
  allowed_work_domains: z.array(workDomainSchema).max(3).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type AdminUserInput = z.infer<typeof adminUserSchema>;

// 📋 Bakım kaydı validasyonu
export const recordSchema = z.object({
  client_request_id: z.string().min(8).max(100).optional(),
  engine_id: z.string().min(1, "Motor seçimi zorunludur."),
  type_key: z.string().min(1, "Bakım türü zorunludur."),
  type_label: z.string().min(1, "Bakım türü adı zorunludur."),
  technician_source: z.enum(["internal", "external_service"]).optional(),
  responsible_technician_id: z.string().min(1).max(100).optional(),
  responsible_technician_duration: z.number().int("Sorumlu teknisyen süresi tam dakika olmalıdır.").nonnegative("Sorumlu teknisyen süresi negatif olamaz.").max(366 * 24 * 60, "Sorumlu teknisyen süresi mantık dışı büyük.").optional(),
  external_service_name: z.string().trim().max(160, "Dış hizmet adı çok uzun.").optional().or(z.literal("")),

  hour_at_completion: z
    .number({ required_error: "Motor çalışma saati gereklidir.", invalid_type_error: "Motor saati bir sayı olmalıdır." })
    .nonnegative("Saat negatif olamaz.")
    .max(5000000, "Saat değeri mantık dışı büyük."),

  // Yeni bakım formları için UTC ISO tarih-saatleri. Eski offline kayıtlar bu alanlar olmadan da kabul edilir.
  time_tracking_version: z.literal(2).optional(),
  maintenance_start_at: z.string().datetime({ offset: true }).optional(),
  maintenance_end_at: z.string().datetime({ offset: true }).optional(),

  technician_note: z.string().max(2000, "Not çok uzun.").optional().or(z.literal("")),
  note: z.string().max(2000, "Not çok uzun.").optional().or(z.literal("")),
  other_technician_ids: z.array(z.string().min(1).max(100)).max(20, "En fazla 20 yardımcı teknisyen seçilebilir.").optional(),
  other_technician_durations: z.record(z.string().min(1).max(100), z.number().int().nonnegative().max(366 * 24 * 60)).optional(),
  checklist: z.array(z.object({ label: z.string().min(1).max(200), completed: z.boolean() })).max(20).optional(),
  completion_confirmation: z.boolean().optional(),

  photos_b64: z.array(z.string()).max(10, "En fazla 10 fotoğraf.").optional(),
  photos: z.array(z.string().url("Geçerli bir medya URL’si gerekli.")).max(10, "En fazla 10 fotoğraf.").optional(),

  // Hem eski (base64) hem yeni (blob link) video formatlarını kabul et
  videos: z
    .array(
      z.union([
        z.string(),
        z
          .object({
            url: z.string().optional(),
            data_b64: z.string().optional(),
            filename: z.string().max(200).optional(),
            mime: z.string().max(100).optional(),
          })
          .passthrough(),
      ])
    )
    .max(5, "En fazla 5 video.")
    .optional(),

  report_attachments: z.array(z.object({
    id: z.string().min(8).max(100),
    url: z.string().refine((value) => value.startsWith("offline:") || isAllowedReportAttachmentUrl(value), "Rapor eki yalnızca güvenilir Blob URL’si olmalıdır."),
    filename: z.string().trim().min(1).max(180),
    mime: z.string().refine(isReportAttachmentMime, "Rapor eki PDF, Excel veya Word formatında olmalıdır."),
    size: z.number().int().positive().max(REPORT_ATTACHMENT_MAX_BYTES, "Rapor eki 20 MB’tan küçük olmalıdır."),
    uploaded_at: z.string().datetime({ offset: true }),
    uploaded_by_id: z.string().min(1).max(100).optional(),
  })).max(REPORT_ATTACHMENT_MAX_COUNT, `En fazla ${REPORT_ATTACHMENT_MAX_COUNT} rapor eki.`).optional(),

  pressure_reading: z
    .number({ invalid_type_error: "Basınç bir sayı olmalıdır." })
    .min(0, "Basınç negatif olamaz.")
    .max(200, "Basınç değeri mantık dışı.")
    .optional(),

  backdated: z.boolean().optional(),
  record_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih biçimi geçersiz (YYYY-AA-GG).")
    .optional(),

  period: z
    .number({ invalid_type_error: "Periyot bir sayı olmalıdır." })
    .positive("Periyot pozitif olmalıdır.")
    .max(500000, "Periyot mantık dışı büyük.")
    .optional(),

  extra_types: z
    .array(
      z.object({
        type_key: z.string().min(1),
        type_label: z.string().min(1),
        period: z.number().positive("Periyot pozitif olmalıdır.").max(500000).optional(),
      })
    )
    .max(20, "Çok fazla ek bakım türü.")
    .optional(),
});

// 👥 Yönetici teyidinde her ekip üyesinin gerçek katkı süresi ayrı doğrulanır.
export const recordConfirmationSchema = z.object({
  engine_id: z.string().min(1, "Motor kimliği geçersiz.").max(100).optional(),
  technician_contributions: z.array(z.object({
    id: z.string().min(1).max(100),
    duration_minutes: z.number({ required_error: "Kişi çalışma süresi gereklidir.", invalid_type_error: "Kişi çalışma süresi sayı olmalıdır." })
      .int("Kişi çalışma süresi tam dakika olmalıdır.")
      .positive("Çalışan kişi için çalışma süresi 0’dan büyük olmalıdır.")
      .max(366 * 24 * 60, "Kişi çalışma süresi mantık dışı büyük."),
  })).max(20, "En fazla 20 ekip üyesi teyit edilebilir."),
});

export type RecordConfirmationInput = z.infer<typeof recordConfirmationSchema>;

// 🔍 Schema'lardan türetilen tipler (TypeScript'in gücü burada!)
export type RecordInput = z.infer<typeof recordSchema>;

// Zod hatalarını tek okunabilir mesajda birleştir
export function formatZodError(error: ZodError): string {
  return error.issues.map((i) => i.message).join(" ");
}
