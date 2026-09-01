"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { checkRateLimit } from "@/lib/rate-limit";
import { registerCustomer } from "@/src/services/registration";

export type RegisterFormState = {
  error?: string;
};

const registerSchema = z.object({
  email: z.email("Bitte eine gültige E-Mail-Adresse angeben."),
  name: z.string().trim().min(2, "Bitte den Namen angeben.").max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((v) => (v === "" ? null : v)),
  password: z
    .string()
    .min(10, "Das Passwort muss mindestens 10 Zeichen haben."),
  terms: z.literal("on", {
    message: "Bitte den AGB und der Datenschutzerklärung zustimmen.",
  }),
});

export async function register(
  _prev: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    password: formData.get("password"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  if (
    !checkRateLimit(`register:${parsed.data.email}`, {
      limit: Number(process.env.REGISTER_RATE_LIMIT ?? 3),
      windowMs: 15 * 60 * 1000,
    })
  ) {
    return {
      error: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.",
    };
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";

  await registerCustomer({
    email: parsed.data.email,
    name: parsed.data.name,
    phone: parsed.data.phone,
    password: parsed.data.password,
    confirmBaseUrl: `${proto}://${host}`,
  });

  redirect("/registrieren/gesendet");
}
