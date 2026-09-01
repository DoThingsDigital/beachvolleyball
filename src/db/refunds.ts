import { prisma } from "./client";

// Erstattungen (Ticket 3.3, H3/I1). Refund-Zeilen sind append-only;
// Statuswechsel kommen über den Stripe-Webhook (charge.refunded).

export async function sumActiveRefunds(orderId: string): Promise<number> {
  const result = await prisma.refund.aggregate({
    where: { orderId, status: { in: ["PENDING", "SUCCEEDED"] } },
    _sum: { amountCents: true },
  });
  return result._sum.amountCents ?? 0;
}

export function findSucceededPayment(orderId: string) {
  return prisma.payment.findFirst({
    where: { orderId, status: "SUCCEEDED", provider: "STRIPE" },
    orderBy: { createdAt: "desc" },
  });
}

export function createRefundRecord(entry: {
  paymentId: string;
  orderId: string;
  amountCents: number;
  reason: string;
  providerRef: string;
  createdByUserId: string;
  creditNoteInvoiceId: string;
}) {
  return prisma.refund.create({ data: { ...entry, status: "PENDING" } });
}

export function markRefundByProviderRef(
  providerRef: string,
  status: "SUCCEEDED" | "FAILED",
) {
  return prisma.refund.updateMany({
    where: { providerRef, status: "PENDING" },
    data: { status },
  });
}

export function findInvoiceById(invoiceId: string) {
  return prisma.invoice.findUnique({ where: { id: invoiceId } });
}
