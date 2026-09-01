import { prisma } from "./client";

// Versandprotokoll (J1): jede Transaktionsmail wird geloggt – auch im
// Dev-Modus ohne Provider, damit das Verhalten identisch bleibt.
export function logEmail(entry: {
  userId?: string | null;
  to: string;
  template: string;
  templateVersion: string;
  providerMessageId?: string | null;
  status: "SENT" | "FAILED" | "DEV_LOGGED";
  refType?: string | null;
  refId?: string | null;
}) {
  return prisma.emailLog.create({ data: entry });
}
