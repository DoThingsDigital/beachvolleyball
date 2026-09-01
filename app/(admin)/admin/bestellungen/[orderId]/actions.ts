"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseEuroToCents } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";
import { DomainError } from "@/src/domain/errors";
import { resendInvoiceEmail } from "@/src/services/invoices";
import { refundOrder } from "@/src/services/refunds";

export type AdminOrderActionState = {
  ok?: string;
  error?: string;
};

const refundSchema = z.object({
  orderId: z.string().min(1),
  amount: z.string().trim(),
  reason: z.string().trim().min(3, "Bitte einen Grund angeben.").max(200),
});

export async function adminRefundOrder(
  _prev: AdminOrderActionState,
  formData: FormData,
): Promise<AdminOrderActionState> {
  const staff = await requireStaff();
  const parsed = refundSchema.safeParse({
    orderId: formData.get("orderId"),
    amount: formData.get("amount") ?? "",
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  // Mandanten-Check: Bestellung muss zum Kontext gehören
  const repos = createRepositories(staff.ctx);
  const order = await repos.orders.findForAdmin(parsed.data.orderId);
  if (!order) return { error: "Bestellung nicht gefunden." };

  let amountCents: number | undefined;
  if (parsed.data.amount !== "") {
    const cents = parseEuroToCents(parsed.data.amount);
    if (cents === null) {
      return { error: "Betrag bitte als Euro angeben, z. B. 12,50." };
    }
    amountCents = cents;
  }

  try {
    const result = await refundOrder({
      orderId: order.id,
      amountCents,
      reason: parsed.data.reason,
      actorUserId: staff.userId,
    });
    await repos.auditLogs.create({
      actorUserId: staff.userId,
      entity: "Order",
      entityId: order.id,
      action: "order.refund",
      diff: {
        amountCents: result.amountCents,
        reason: parsed.data.reason,
        creditNote: result.creditNote.number,
      },
    });
    revalidatePath(`/admin/bestellungen/${order.id}`);
    return {
      ok: `Erstattung ausgelöst – Gutschrift ${result.creditNote.number}.`,
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

const resendSchema = z.object({
  orderId: z.string().min(1),
  invoiceId: z.string().min(1),
});

export async function adminResendInvoice(
  _prev: AdminOrderActionState,
  formData: FormData,
): Promise<AdminOrderActionState> {
  const staff = await requireStaff();
  const parsed = resendSchema.safeParse({
    orderId: formData.get("orderId"),
    invoiceId: formData.get("invoiceId"),
  });
  if (!parsed.success) return { error: "Ungültige Anfrage." };

  const repos = createRepositories(staff.ctx);
  const order = await repos.orders.findForAdmin(parsed.data.orderId);
  const invoice = order?.invoices.find((i) => i.id === parsed.data.invoiceId);
  if (!order || !invoice) return { error: "Rechnung nicht gefunden." };

  try {
    const result = await resendInvoiceEmail(invoice.id);
    if (!result.ok) {
      return {
        error:
          "Versand fehlgeschlagen (Empfänger vom Test-Absender nicht erlaubt?). Details im EmailLog.",
      };
    }
    return { ok: `${result.number} erneut versendet.` };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}
