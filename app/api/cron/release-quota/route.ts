import { NextResponse } from "next/server";

import { releaseUnconfirmedQuota } from "@/src/services/quota-release";

// Kontingent-Freigabe (Ticket 5.2, E3): unbestätigte VEREIN-Belegungen
// werden `releaseHoursBefore` vor Beginn kommerziell buchbar (RELEASED).
// Idempotent; Aufruf per Cron mit Bearer CRON_SECRET.
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await releaseUnconfirmedQuota();
  return NextResponse.json(result);
}
