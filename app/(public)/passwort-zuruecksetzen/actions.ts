"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { checkRateLimit } from "@/lib/rate-limit";
import { resetPassword } from "@/src/services/account";

export type ResetFormState = { error?: string };

const schema = z
  .object({
    email: z.email(),
    token: z.string().min(10),
    password: z
      .string()
      .min(10, "Das Passwort muss mindestens 10 Zeichen haben."),
    passwordRepeat: z.string(),
  })
  .refine((v) => v.password === v.passwordRepeat, {
    message: "Die Passwörter stimmen nicht überein.",
  });

export async function submitNewPassword(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
    password: formData.get("password"),
    passwordRepeat: formData.get("passwordRepeat"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  if (
    !checkRateLimit(`pwreset-submit:${parsed.data.email.toLowerCase()}`, {
      limit: Number(process.env.LOGIN_RATE_LIMIT ?? 10),
      windowMs: 15 * 60 * 1000,
    })
  ) {
    return { error: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen." };
  }

  const result = await resetPassword({
    email: parsed.data.email,
    token: parsed.data.token,
    password: parsed.data.password,
  });
  if (result === "expired") {
    return {
      error:
        "Der Link ist abgelaufen. Bitte fordere unter Passwort vergessen einen neuen an.",
    };
  }
  if (result === "invalid") {
    return {
      error:
        "Der Link ist ungültig oder wurde bereits verwendet. Bitte fordere einen neuen an.",
    };
  }
  redirect("/login?reset=ok");
}
