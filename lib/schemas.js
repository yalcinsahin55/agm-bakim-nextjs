import { z } from "zod";

// 🔐 Login validation
export const loginSchema = z.object({
  email: z
    .string({ required_error: "E-mail is required." })
    .trim()
    .email("Please enter a valid e-mail address.")
    .max(254, "E-mail address is too long."),
  password: z
    .string({ required_error: "Password is required." })
    .min(6, "Password must be at least 6 characters.")
    .max(128, "Password is too long."),
});

// 👤 Registration validation
export const registerSchema = z.object({
  full_name: z
    .string({ required_error: "Full name is required." })
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(100, "Full name is too long."),
  email: z
    .string({ required_error: "E-mail is required." })
    .trim()
    .email("Please enter a valid e-mail address.")
    .max(254, "E-mail address is too long."),
  password: z
    .string({ required_error: "Password is required." })
    .min(6, "Password must be at least 6 characters.")
    .max(128, "Password is too long."),
});

// 📋 Maintenance record validation — the shield that protects the heart
export const recordSchema = z.object({
  engine_id: z.string().min(1, "Engine selection is required."),
  type_key: z.string().min(1, "Maintenance type is required."),
  type_label: z.string().min(1, "Maintenance type name is required."),

  hour_at_completion: z
    .number({ required_error: "Engine operating hours are required.", invalid_type_error: "Engine hours must be a number." })
    .nonnegative("Hours cannot be negative.")
    .max(5000000, "The hour value is unreasonably large."),

  technician_note: z.string().max(2000, "Note is too long.").optional().or(z.literal("")),
  note: z.string().max(2000, "Note is too long.").optional().or(z.literal("")),

  photos_b64: z.array(z.string()).max(10, "Up to 10 photos.").optional(),

  // Accepts both old (base64) and new (blob link) video formats
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
    .max(5, "Up to 5 videos.")
    .optional(),

  pressure_reading: z
    .number({ invalid_type_error: "Pressure must be a number." })
    .min(0, "Pressure cannot be negative.")
    .max(200, "Pressure value is unreasonable.")
    .optional(),

  backdated: z.boolean().optional(),
  record_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date format is invalid.")
    .optional(),

  period: z
    .number({ invalid_type_error: "Period must be a number." })
    .positive("Period must be positive.")
    .max(500000, "Period is unreasonably large.")
    .optional(),

  extra_types: z
    .array(
      z.object({
        type_key: z.string().min(1),
        type_label: z.string().min(1),
        period: z.number().positive("Period must be positive.").max(500000).optional(),
      })
    )
    .max(20, "Too many additional maintenance types.")
    .optional(),
});

// Combines Zod errors into a single readable message
export function formatZodError(error) {
  return error.issues.map((i) => i.message).join(" ");
}
