"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/src/auth";
import { DomainError } from "@/src/domain/errors";
import { createSubscriptionOrder } from "@/src/services/orders";
import { getPublicShopContext } from "@/src/services/public-context";

export type CheckoutStartState = {
  error?: string;
  errorCode?: string;
};

const selectionSchema = z.object({
  courtId: z.string().min(1),
  weekday: z.coerce.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMin: z.coerce.number().int().min(15).max(480),
});

export async function startSubscriptionCheckout(
  _prev: CheckoutStartState,
  formData: FormData,
): Promise<CheckoutStartState> {
  const parsed = selectionSchema.safeParse({
    courtId: formData.get("courtId"),
    weekday: formData.get("weekday"),
    startTime: formData.get("startTime"),
    durationMin: formData.get("durationMin"),
  });
  if (!parsed.success) {
    return { error: "Ungültige Auswahl." };
  }

  const session = await auth();
  if (!session?.user) {
    const back = `/vorverkauf?dauer=${parsed.data.durationMin}&tag=${parsed.data.weekday}&zeit=${parsed.data.startTime}&platz=${parsed.data.courtId}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  const shop = await getPublicShopContext();
  if (!shop) {
    return { error: "Der Vorverkauf ist aktuell nicht geöffnet." };
  }

  let orderId: string;
  try {
    const result = await createSubscriptionOrder(shop.ctx, {
      userId: session.user.id,
      venueId: shop.venue.id,
      seasonId: shop.season.id,
      courtId: parsed.data.courtId,
      weekday: parsed.data.weekday,
      startTime: parsed.data.startTime,
      durationMin: parsed.data.durationMin,
    });
    orderId = result.orderId;
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message, errorCode: error.code };
    }
    throw error;
  }

  redirect(`/bestellung/${orderId}`);
}
