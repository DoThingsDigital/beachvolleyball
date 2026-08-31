"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/src/auth";

export type LoginFormState = {
  error?: string;
};

const passwordLoginSchema = z.object({
  email: z.email("Bitte eine gültige E-Mail-Adresse angeben."),
  password: z.string().min(1, "Bitte das Passwort angeben."),
});

const magicLinkSchema = z.object({
  email: z.email("Bitte eine gültige E-Mail-Adresse angeben."),
});

// Nur interne Pfade als Redirect-Ziel zulassen (kein Open Redirect).
function safeCallbackUrl(formData: FormData): string {
  const raw = formData.get("callbackUrl");
  if (typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/konto";
}

export async function loginWithPassword(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = passwordLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeCallbackUrl(formData),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "E-Mail-Adresse oder Passwort ist falsch." };
    }
    throw error; // NEXT_REDIRECT muss durchlaufen
  }
  return {};
}

export async function requestMagicLink(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  try {
    await signIn("email", {
      email: parsed.data.email,
      redirectTo: safeCallbackUrl(formData),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Der Anmeldelink konnte nicht versendet werden. Bitte später erneut versuchen.",
      };
    }
    throw error;
  }
  return {};
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
