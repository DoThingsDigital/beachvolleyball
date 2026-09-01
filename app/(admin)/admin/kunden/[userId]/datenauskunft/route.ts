import { NextResponse } from "next/server";

import { requireStaff } from "@/src/auth/guards";
import { exportUserData } from "@/src/db/privacy";

// Datenauskunft (Ticket 6.5, A5): vollständiger JSON-Export der
// personenbezogenen Daten eines Kunden (Art. 15 DSGVO).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const staff = await requireStaff();
  const { userId } = await params;
  const data = await exportUserData(staff.ctx, userId);
  if (!data) {
    return NextResponse.json({ error: "Kunde nicht gefunden." }, { status: 404 });
  }
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="Datenauskunft-${userId}.json"`,
    },
  });
}
