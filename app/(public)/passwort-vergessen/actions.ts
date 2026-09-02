"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { checkRateLimit } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/src/services/account";

export type ForgotFormState = { ok?: boolean; error?: string };

const schema = z.object({
  email: z.email("Bitte eine gültige E-Mail-Adresse angeben."),
});

export async function requestReset(
  _prev: ForgotFormState,
  formData: FormData,
): Promise<ForgotFormState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  if (
    !checkRateLimit(`pwreset:${parsed.data.email.toLowerCase()}`, {
      limit: Number(process.env.REGISTER_RATE_LIMIT ?? 3),
      windowMs: 15 * 60 * 1000,
    })
  ) {
    return { error: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen." };
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  await requestPasswordReset({
    email: parsed.data.email,
    baseUrl: `${proto}://${host}`,
  });
  return { ok: true };
}
