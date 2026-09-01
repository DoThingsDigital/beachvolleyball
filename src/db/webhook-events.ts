import { Prisma } from "@/src/generated/prisma/client";

import { prisma } from "./client";

// WebhookEvent ist eine Technik-Tabelle ohne Mandantenbezug (G4):
// eindeutig je (provider, eventId) → doppelte Zustellungen sind No-ops.

export type RecordResult = "created" | "duplicate";

export async function recordWebhookEvent(entry: {
  provider: string;
  eventId: string;
  type: string;
  payload: Prisma.InputJsonValue;
}): Promise<RecordResult> {
  try {
    await prisma.webhookEvent.create({ data: entry });
    return "created";
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "duplicate";
    }
    throw error;
  }
}

export function markWebhookEventProcessed(
  provider: string,
  eventId: string,
  errorMessage?: string,
) {
  return prisma.webhookEvent.updateMany({
    where: { provider, eventId },
    data: { processedAt: new Date(), error: errorMessage ?? null },
  });
}
