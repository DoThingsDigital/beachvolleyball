"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/src/auth";
import { updateProfile } from "@/src/db/users";
import { DomainError } from "@/src/domain/errors";
import { cancelBookingByCustomer } from "@/src/services/booking-cancellation";
import { getPublicShopContext } from "@/src/services/public-context";

export type ProfileFormState = {
  ok?: boolean;
  error?: string;
};

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const profileSchema = z
  .object({
    name: z.string().trim().min(2, "Bitte den Namen angeben.").max(100),
    phone: optionalTrimmed(30),
    billingStreet: optionalTrimmed(120),
    billingZip: optionalTrimmed(10),
    billingCity: optionalTrimmed(80),
    billingCountry: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v === "" ? null : v))
      .pipe(
        z
          .string()
          .length(2, "Ländercode mit 2 Buchstaben angeben (z. B. DE).")
          .nullable(),
      ),
  })
  .superRefine((v, ctx) => {
    const parts = [v.billingStreet, v.billingZip, v.billingCity, v.billingCountry];
    const some = parts.some(Boolean);
    const all = parts.every(Boolean);
    if (some && !all) {
      ctx.addIssue({
        code: "custom",
        message:
          "Rechnungsadresse bitte vollständig angeben (Straße, PLZ, Ort, Land).",
      });
    }
    if (v.billingCountry === "DE" && v.billingZip && !/^\d{5}$/.test(v.billingZip)) {
      ctx.addIssue({
        code: "custom",
        message: "Für Deutschland bitte eine 5-stellige PLZ angeben.",
      });
    }
  });

export async function saveProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Nicht angemeldet." };
  }

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    billingStreet: formData.get("billingStreet") ?? "",
    billingZip: formData.get("billingZip") ?? "",
    billingCity: formData.get("billingCity") ?? "",
    billingCountry: formData.get("billingCountry") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  await updateProfile(session.user.id, parsed.data);
  revalidatePath("/konto");
  return { ok: true };
}

export type CancelBookingState = {
  ok?: string;
  error?: string;
};

export async function cancelMyBooking(
  _prev: CancelBookingState,
  formData: FormData,
): Promise<CancelBookingState> {
  const session = await auth();
  if (!session?.user) return { error: "Nicht angemeldet." };

  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) return { error: "Buchung fehlt." };

  const shop = await getPublicShopContext();
  if (!shop) return { error: "Aktuell nicht möglich." };

  try {
    const result = await cancelBookingByCustomer(shop.ctx, {
      bookingId,
      userId: session.user.id,
    });
    revalidatePath("/konto");
    if (result.refundMode === "MONEY" && result.creditNoteNumber) {
      return { ok: `Storniert – Erstattung ist unterwegs (${result.creditNoteNumber}).` };
    }
    if (result.refundMode === "CREDIT" && result.amountCents > 0) {
      return { ok: "Storniert – der Betrag wurde deinem Guthaben gutgeschrieben." };
    }
    return { ok: "Buchung storniert." };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}
