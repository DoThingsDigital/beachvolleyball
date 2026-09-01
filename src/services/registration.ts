import { hashPassword } from "@/src/auth/password";
import {
  consumeVerificationToken,
  createCustomer,
  createVerificationToken,
  findOrganisationBySlug,
  findUserByEmail,
  type ConfirmResult,
} from "@/src/db/registration";
import { getBrandName, sendEmail } from "@/src/email/send";
import {
  VERIFY_EMAIL_TEMPLATE,
  VERIFY_EMAIL_VERSION,
  VerifyEmailMail,
} from "@/src/email/templates/verify-email-mail.v1";

// Use-Case Registrierung mit Double-Opt-in (A1, Ticket 1.8).
// Rückgabe ist bewusst enumeration-sicher: ob die Adresse schon existiert,
// wird nach außen nicht verraten.

export async function registerCustomer(params: {
  email: string;
  name: string;
  phone: string | null;
  password: string;
  confirmBaseUrl: string;
}): Promise<{ ok: true }> {
  const orgSlug = process.env.DEFAULT_ORG_SLUG ?? "dtd";
  const organisation = await findOrganisationBySlug(orgSlug);
  if (!organisation) {
    throw new Error(`Organisation "${orgSlug}" fehlt – Seed ausführen.`);
  }
  const settings = organisation.settings as { termsVersion?: string } | null;
  const termsVersion = settings?.termsVersion ?? "v1";

  const existing = await findUserByEmail(params.email);
  if (existing) {
    // Kein neuer Account, keine Mail – Antwort bleibt identisch (kein Leak).
    return { ok: true };
  }

  const passwordHash = await hashPassword(params.password);
  const user = await createCustomer({
    email: params.email,
    name: params.name,
    phone: params.phone,
    passwordHash,
    organisationId: organisation.id,
    termsVersion,
  });

  const token = await createVerificationToken(params.email);
  const url = `${params.confirmBaseUrl}/registrieren/bestaetigen?email=${encodeURIComponent(params.email)}&token=${token}`;
  const result = await sendEmail({
    to: params.email,
    subject: "Bitte E-Mail-Adresse bestätigen",
    react: VerifyEmailMail({ url, brandName: getBrandName() }),
    template: VERIFY_EMAIL_TEMPLATE,
    templateVersion: VERIFY_EMAIL_VERSION,
    userId: user.id,
    refType: "registration",
    refId: user.id,
  });
  if (!result.ok && process.env.NODE_ENV !== "production") {
    // Dev-Komfort bis zur Resend-Domain-Verifizierung (siehe magic-link.v1)
    console.log(
      `\n[registrierung:dev-fallback] Bestätigungslink für ${params.email}:\n${url}\n`,
    );
  }

  return { ok: true };
}

export function confirmRegistration(
  email: string,
  token: string,
): Promise<ConfirmResult> {
  return consumeVerificationToken(email, token);
}
