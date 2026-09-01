import { NextResponse } from "next/server";

import { sendBookingReminders } from "@/src/services/reminders";

// Erinnerungs-Cron (Ticket 4.8, NF5): idempotent, stündlicher Aufruf empfohlen.
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendBookingReminders();
  return NextResponse.json(result);
}
