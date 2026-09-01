import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Resend } from "resend";

import { logEmail } from "@/src/db/email-log";

// Zentraler Mailversand (Ticket 1.9): rendert React-Email-Templates,
// verschickt über Resend und protokolliert jeden Versand in EmailLog.
// Ohne RESEND_API_KEY (lokal ohne Account): Inhalt wird geloggt statt
// verschickt – gleiches Verhalten, kein stiller Verlust.

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resendClient ??= new Resend(key);
  return resendClient;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  react: ReactElement;
  template: string;
  templateVersion: string;
  userId?: string | null;
  refType?: string | null;
  refId?: string | null;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<{ ok: boolean; messageId?: string }> {
  const {
    to,
    subject,
    react,
    template,
    templateVersion,
    userId,
    refType,
    refId,
    attachments,
  } = params;

  const html = await render(react);
  const text = await render(react, { plainText: true });
  const resend = getResend();

  if (!resend) {
    const attachmentNote = attachments?.length
      ? ` [Anhänge: ${attachments.map((a) => a.filename).join(", ")}]`
      : "";
    console.log(
      `\n[email:dev] ${template}@${templateVersion} an ${to} – "${subject}"${attachmentNote}\n${text}\n`,
    );
    await logEmail({
      userId,
      to,
      template,
      templateVersion,
      status: "DEV_LOGGED",
      refType,
      refId,
    });
    return { ok: true };
  }

  const from = process.env.MAIL_FROM;
  if (!from) {
    throw new Error("MAIL_FROM ist nicht gesetzt.");
  }

  const result = await resend.emails.send({
    from,
    to,
    subject,
    html,
    text,
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
  const ok = !result.error;
  await logEmail({
    userId,
    to,
    template,
    templateVersion,
    providerMessageId: result.data?.id ?? null,
    status: ok ? "SENT" : "FAILED",
    refType,
    refId,
  });

  if (!ok) {
    console.error(
      `[email] Versand fehlgeschlagen (${template}@${templateVersion} an ${to}):`,
      result.error,
    );
  }
  return { ok, messageId: result.data?.id };
}

export function getBrandName(): string {
  return process.env.MAIL_BRAND_NAME ?? "dtd-booking";
}
