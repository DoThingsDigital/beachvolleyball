import { NextResponse } from "next/server";

import { auth } from "@/src/auth";
import { STAFF_ROLES } from "@/src/auth/config";
import { findInvoiceWithUser } from "@/src/db/invoices";
import { readInvoicePdf } from "@/src/services/storage";

// Admin-Download für Rechnungen/Gutschriften (K1).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  const staffMembership = session?.user.memberships.find((m) =>
    STAFF_ROLES.includes(m.role),
  );
  if (!staffMembership) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await params;
  const invoice = await findInvoiceWithUser(invoiceId);
  if (!invoice || invoice.organisationId !== staffMembership.organisationId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const pdf = await readInvoicePdf(invoice.pdfKey);
  const label = invoice.type === "CREDIT_NOTE" ? "Gutschrift" : "Rechnung";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${label}-${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
