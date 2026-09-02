import { hashPassword, verifyPassword } from "@/src/auth/password";
import {
  consumeEmailChangeToken,
  consumePasswordResetToken,
  createEmailChangeToken,
  createPasswordResetToken,
  findUserWithPassword,
  isEmailTaken,
  setPasswordByEmail,
  setPasswordById,
  type EmailChangeResult,
  type TokenResult,
} from "@/src/db/account";
import { findUserByEmail } from "@/src/db/registration";
import { DomainError } from "@/src/domain/errors";
import { getBrandName, sendEmail } from "@/src/email/send";
import {
  EMAIL_CHANGE_NOTICE_TEMPLATE,
  EMAIL_CHANGE_TEMPLATE,
  EMAIL_CHANGE_VERSION,
  EmailChangeMail,
  EmailChangeNoticeMail,
} from "@/src/email/templates/email-change-mail.v1";
import {
  PASSWORD_RESET_TEMPLATE,
  PASSWORD_RESET_VERSION,
  PasswordResetMail,
} from "@/src/email/templates/password-reset-mail.v1";

// Konto-Selbstverwaltung (A1-Nachtrag): Passwort vergessen/ändern und
// E-Mail-Wechsel mit Bestätigung an die neue Adresse. Der Reset-Flow ist
// enumeration-sicher (Antwort verrät nie, ob die Adresse existiert).

export async function requestPasswordReset(params: {
  email: string;
  baseUrl: string;
}): Promise<{ ok: true }> {
  const user = await findUserByEmail(params.email);
  if (!user) return { ok: true }; // kein Leak

  const token = await createPasswordResetToken(params.email);
  const url = `${params.baseUrl}/passwort-zuruecksetzen?email=${encodeURIComponent(params.email)}&token=${token}`;
  const result = await sendEmail({
    to: params.email,
    subject: "Neues Passwort festlegen",
    react: PasswordResetMail({ brandName: getBrandName(), url }),
    template: PASSWORD_RESET_TEMPLATE,
    templateVersion: PASSWORD_RESET_VERSION,
    userId: user.id,
    refType: "password-reset",
    refId: user.id,
  });
  if (!result.ok && process.env.NODE_ENV !== "production") {
    console.log(
      `\n[passwort-reset:dev-fallback] Link für ${params.email}:\n${url}\n`,
    );
  }
  return { ok: true };
}

export async function resetPassword(params: {
  email: string;
  token: string;
  password: string;
}): Promise<TokenResult> {
  const result = await consumePasswordResetToken(params.email, params.token);
  if (result !== "ok") return result;
  const passwordHash = await hashPassword(params.password);
  const updated = await setPasswordByEmail(params.email, passwordHash);
  return updated ? "ok" : "invalid";
}

export async function changePassword(params: {
  userId: string;
  currentPassword: string | null;
  newPassword: string;
}): Promise<void> {
  const user = await findUserWithPassword(params.userId);
  if (!user || user.anonymizedAt) {
    throw new DomainError("NOT_FOUND", "Konto nicht gefunden.");
  }
  // Konten ohne Passwort (Magic-Link/Import) setzen erstmalig ohne Abfrage
  if (user.passwordHash) {
    const valid = params.currentPassword
      ? await verifyPassword(user.passwordHash, params.currentPassword)
      : false;
    if (!valid) {
      throw new DomainError(
        "INVALID_TRANSITION",
        "Das aktuelle Passwort ist falsch.",
      );
    }
  }
  await setPasswordById(params.userId, await hashPassword(params.newPassword));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "…";
  return `${local.slice(0, 2)}…@${domain}`;
}

export async function requestEmailChange(params: {
  userId: string;
  newEmail: string;
  currentPassword: string;
  baseUrl: string;
}): Promise<void> {
  const user = await findUserWithPassword(params.userId);
  if (!user || user.anonymizedAt) {
    throw new DomainError("NOT_FOUND", "Konto nicht gefunden.");
  }
  if (user.email.toLowerCase() === params.newEmail.toLowerCase()) {
    throw new DomainError(
      "INVALID_PERIOD",
      "Das ist bereits deine aktuelle E-Mail-Adresse.",
    );
  }
  if (!user.passwordHash) {
    throw new DomainError(
      "INVALID_TRANSITION",
      "Bitte zuerst ein Passwort festlegen (Sicherheitsabfrage für den Wechsel).",
    );
  }
  if (!(await verifyPassword(user.passwordHash, params.currentPassword))) {
    throw new DomainError(
      "INVALID_TRANSITION",
      "Das aktuelle Passwort ist falsch.",
    );
  }
  if (await isEmailTaken(params.newEmail)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      "Diese E-Mail-Adresse wird bereits verwendet.",
    );
  }

  const token = await createEmailChangeToken(params.userId, params.newEmail);
  const url = `${params.baseUrl}/email-aendern?uid=${params.userId}&email=${encodeURIComponent(params.newEmail)}&token=${token}`;
  const sent = await sendEmail({
    to: params.newEmail,
    subject: "Neue E-Mail-Adresse bestätigen",
    react: EmailChangeMail({ brandName: getBrandName(), url }),
    template: EMAIL_CHANGE_TEMPLATE,
    templateVersion: EMAIL_CHANGE_VERSION,
    userId: params.userId,
    refType: "email-change",
    refId: params.userId,
  });
  if (!sent.ok && process.env.NODE_ENV !== "production") {
    console.log(
      `\n[email-wechsel:dev-fallback] Link für ${params.newEmail}:\n${url}\n`,
    );
  }
  // Info an die bisherige Adresse (Missbrauchs-Erkennung)
  await sendEmail({
    to: user.email,
    subject: "Wechsel deiner E-Mail-Adresse angefordert",
    react: EmailChangeNoticeMail({
      brandName: getBrandName(),
      newEmailMasked: maskEmail(params.newEmail),
    }),
    template: EMAIL_CHANGE_NOTICE_TEMPLATE,
    templateVersion: EMAIL_CHANGE_VERSION,
    userId: params.userId,
    refType: "email-change",
    refId: params.userId,
  }).catch(() => {});
}

export function confirmEmailChange(params: {
  userId: string;
  newEmail: string;
  token: string;
}): Promise<EmailChangeResult> {
  return consumeEmailChangeToken(params.userId, params.newEmail, params.token);
}
