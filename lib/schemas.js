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

// Zod hatalarını tek okunabilir mesajda birleştir
export function formatZodError(error) {
  return error.issues.map((i) => i.message).join(" ");
}
