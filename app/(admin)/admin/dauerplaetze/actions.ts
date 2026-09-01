"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formatCents } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { DomainError } from "@/src/domain/errors";
import { cancelSubscription } from "@/src/services/subscriptions";
import { invalidateOccupancyCache } from "@/src/services/occupancy";

export type SubscriptionAdminActionState = { ok?: string; error?: string };

const cancelSchema = z.object({
  subscriptionId: z.string().min(1),
  reason: z.string().trim().min(2, "Grund angeben.").max(200),
  withRefund: z.boolean(),
});

export async function cancelSubscriptionAction(
  _prev: SubscriptionAdminActionState,
  formData: FormData,
): Promise<SubscriptionAdminActionState> {
  const staff = await requireStaff();
  const parsed = cancelSchema.safeParse({
    subscriptionId: formData.get("subscriptionId"),
    reason: formData.get("reason"),
    withRefund: formData.get("withRefund") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  try {
    const result = await cancelSubscription(staff.ctx, {
      subscriptionId: parsed.data.subscriptionId,
      reason: parsed.data.reason,
      actorUserId: staff.userId,
      withRefund: parsed.data.withRefund,
    });
    invalidateOccupancyCache();
    revalidatePath("/admin/dauerplaetze");
    const refundInfo = result.creditNoteNumber
      ? ` Gutschrift ${result.creditNoteNumber} über ${formatCents(result.refundCents)} erstellt.`
      : "";
    return {
      ok: `Gekündigt – ${result.cancelledCount} zukünftige Termine storniert.${refundInfo}`,
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}
