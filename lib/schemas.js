import { z } from "zod";

// 🔐 Giriş validasyonu
export const loginSchema = z.object({
  email: z
    .string({ required_error: "E-posta gereklidir." })
    .trim()
    .email("Geçerli bir e-posta adresi girin.")
    .max(254, "E-posta adresi çok uzun."),
  password: z
    .string({ required_error: "Şifre gereklidir." })
    .min(6, "Şifre en az 6 karakter olmalıdır.")
    .max(128, "Şifre çok uzun."),
});

// 👤 Kayıt validasyonu
export const registerSchema = z.object({
  full_name: z
    .string({ required_error: "Ad Soyad gereklidir." })
    .trim()
    .min(2, "Ad Soyad en az 2 karakter olmalı.")
    .max(100, "Ad Soyad çok uzun."),
  email: z
    .string({ required_error: "E-posta gereklidir." })
    .trim()
    .email("Geçerli bir e-posta adresi girin.")
    .max(254, "E-posta adresi çok uzun."),
  password: z
    .string({ required_error: "Şifre gereklidir." })
    .min(6, "Şifre en az 6 karakter olmalıdır.")
    .max(128, "Şifre çok uzun."),
});

// 📋 Bakım kaydı validasyonu — kalbi koruyan kalkan
export const recordSchema = z.object({
  engine_id: z.string().min(1, "Motor seçimi zorunludur."),
  type_key: z.string().min(1, "Bakım türü zorunludur."),
  type_label: z.string().min(1, "Bakım türü adı zorunludur."),

  hour_at_completion: z
    .number({ required_error: "Motor çalışma saati gereklidir.", invalid_type_error: "Motor saati bir sayı olmalıdır." })
    .nonnegative("Saat negatif olamaz.")
    .max(5000000, "Saat değeri mantık dışı büyük."),

  technician_note: z.string().max(2000, "Not çok uzun.").optional().or(z.literal("")),
  note: z.string().max(2000, "Not çok uzun.").optional().or(z.literal("")),

  photos_b64: z.array(z.string()).max(10, "En fazla 10 fotoğraf.").optional(),

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

// Zod hatalarını tek okunabilir mesajda birleştir
export function formatZodError(error) {
  return error.issues.map((i) => i.message).join(" ");
}
