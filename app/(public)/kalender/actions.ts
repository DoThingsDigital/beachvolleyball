"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/src/auth";
import { recordTermsAcceptance } from "@/src/db/users";
import { DomainError } from "@/src/domain/errors";
import { getPublicShopContext } from "@/src/services/public-context";
import { createSingleBookingOrder } from "@/src/services/single-booking";

export type BookingStartState = {
  error?: string;
  errorCode?: string;
};

const selectionSchema = z.object({
  courtId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMin: z.coerce.number().int().min(15).max(480),
  terms: z.literal("on", {
    message: "Bitte AGB und Widerrufshinweis bestätigen.",
  }),
});

export async function startSingleBookingCheckout(
  _prev: BookingStartState,
  formData: FormData,
): Promise<BookingStartState> {
  const parsed = selectionSchema.safeParse({
    courtId: formData.get("courtId"),
    date: formData.get("date"),
    time: formData.get("time"),
    durationMin: formData.get("durationMin"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Auswahl." };
  }

  const session = await auth();
  if (!session?.user) {
    const back = `/kalender?tag=${parsed.data.date}&zeit=${parsed.data.time}&platz=${parsed.data.courtId}&dauer=${parsed.data.durationMin}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  const shop = await getPublicShopContext();
  if (!shop) {
    return { error: "Buchungen sind aktuell nicht möglich." };
  }

  let orderId: string;
  try {
    await recordTermsAcceptance(session.user.id, shop.venue.termsVersion);
    const result = await createSingleBookingOrder(shop.ctx, {
      userId: session.user.id,
      venueId: shop.venue.id,
      courtId: parsed.data.courtId,
      date: parsed.data.date,
      time: parsed.data.time,
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
