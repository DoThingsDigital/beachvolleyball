import { Prisma } from "@/src/generated/prisma/client";

import { prisma } from "./client";

// Rechnungsmodul-DB (Ticket 3.1, H1/H2): lückenloser Nummernkreis je
// Aussteller und Jahr, vergeben in derselben Transaktion wie der Insert.
// Der Row-Lock auf InvoiceSequence serialisiert parallele Vergaben; schlägt
// irgendetwas in der Transaktion fehl, rollt auch der Zähler zurück → keine
// Lücke. Rechnungen sind nach issuedAt unveränderlich (kein Update-Pfad).

export type InvoiceInsert = {
  organisationId: string;
  legalEntityId: string;
  invoicePrefix: string;
  type: "INVOICE" | "CREDIT_NOTE";
  orderId: string;
  userId: string;
  relatedInvoiceId?: string | null;
  issueDate: Date;
  servicePeriodFrom: Date;
  servicePeriodTo: Date;
  issuerSnapshot: Prisma.InputJsonValue;
  recipientSnapshot: Prisma.InputJsonValue;
  lines: Prisma.InputJsonValue;
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxRateBp: number;
};

export async function createInvoiceWithNumber(
  input: InvoiceInsert,
  // rendert PDF + persistiert die Datei; läuft innerhalb der Transaktion,
  // damit ein Fehlschlag den Nummernzähler mit zurückrollt
  persistPdf: (invoiceNumber: string) => Promise<{ pdfKey: string; pdfSha256: string }>,
) {
  const year = input.issueDate.getUTCFullYear();

  return prisma.$transaction(
    async (tx) => {
      // ON CONFLICT ohne Spaltenliste: die id ist deterministisch
      // (seq-<entity>-<jahr>), parallele Erst-Inserts kollidieren daher
      // zuerst am Primary Key – auch dieser Konflikt heißt nur
      // "Zeile existiert schon" und darf kein Fehler sein.
      await tx.$executeRaw`
        INSERT INTO "InvoiceSequence" ("id", "legalEntityId", "year", "lastNumber", "createdAt", "updatedAt")
        VALUES (${`seq-${input.legalEntityId}-${year}`}, ${input.legalEntityId}, ${year}, 0, now(), now())
        ON CONFLICT DO NOTHING`;

      const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
        UPDATE "InvoiceSequence"
        SET "lastNumber" = "lastNumber" + 1, "updatedAt" = now()
        WHERE "legalEntityId" = ${input.legalEntityId} AND "year" = ${year}
        RETURNING "lastNumber"`;
      const lastNumber = rows[0]?.lastNumber;
      if (!lastNumber) {
        throw new Error("Nummernkreis konnte nicht erhöht werden.");
      }

      const number = `${input.invoicePrefix}-${year}-${String(lastNumber).padStart(6, "0")}`;
      const { pdfKey, pdfSha256 } = await persistPdf(number);

      return tx.invoice.create({
        data: {
          organisationId: input.organisationId,
          legalEntityId: input.legalEntityId,
          number,
          type: input.type,
          orderId: input.orderId,
          userId: input.userId,
          relatedInvoiceId: input.relatedInvoiceId ?? null,
          issueDate: input.issueDate,
          servicePeriodFrom: input.servicePeriodFrom,
          servicePeriodTo: input.servicePeriodTo,
          issuerSnapshot: input.issuerSnapshot,
          recipientSnapshot: input.recipientSnapshot,
          lines: input.lines,
          netCents: input.netCents,
          taxCents: input.taxCents,
          grossCents: input.grossCents,
          taxRateBp: input.taxRateBp,
          pdfKey,
          pdfSha256,
          issuedAt: new Date(),
        },
      });
    },
    // PDF-Rendering + Storage laufen im Lock-Fenster → großzügige Timeouts;
    // maxWait deckt viele gleichzeitig wartende Transaktionen ab (DoD-Test: 50)
    { timeout: 30_000, maxWait: 60_000 },
  );
}

export function findInvoiceForOrder(orderId: string, type: "INVOICE" | "CREDIT_NOTE") {
  return prisma.invoice.findFirst({ where: { orderId, type } });
}

export function findOrderForInvoicing(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
}

export function findLegalEntityById(legalEntityId: string) {
  return prisma.legalEntity.findUnique({ where: { id: legalEntityId } });
}

export function findInvoiceWithUser(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { user: { select: { id: true, email: true } } },
  });
}
