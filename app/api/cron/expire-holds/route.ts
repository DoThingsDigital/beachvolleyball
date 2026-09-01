import { NextResponse } from "next/server";

import { expireHolds } from "@/src/services/orders";

// Hold-Cleanup (Ticket 2.3, NF5): idempotent, beliebig oft aufrufbar.
// Aufruf per Cron (Coolify/VPS) mit Bearer CRON_SECRET.
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await expireHolds();
  return NextResponse.json(result);
}
