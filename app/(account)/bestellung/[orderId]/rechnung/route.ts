import { NextResponse } from "next/server";

import { auth } from "@/src/auth";
import { findInvoiceForOrder } from "@/src/db/invoices";
import { readInvoicePdf } from "@/src/services/storage";

// Rechnungs-Download (Ticket 3.2, H4) – Route Handler für Downloads.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const invoice = await findInvoiceForOrder(orderId, "INVOICE");
  if (!invoice || invoice.userId !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const pdf = await readInvoicePdf(invoice.pdfKey);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Rechnung-${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
