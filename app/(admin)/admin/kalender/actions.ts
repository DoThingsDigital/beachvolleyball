"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseEuroToCents } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { DomainError } from "@/src/domain/errors";
import {
  adminCancelBooking,
  createManualBooking,
  markNoShow,
  moveBooking,
} from "@/src/services/admin-booking";

export type CalendarActionState = { ok?: string; error?: string };

const manualSchema = z
  .object({
    venueId: z.string().min(1),
    courtId: z.string().min(1, "Platz wählen."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum angeben."),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Zeit angeben."),
    durationMin: z.coerce.number().int().positive(),
    mode: z.enum(["FREE", "INVOICE"]),
    usageType: z.enum(["KOMMERZIELL", "VEREIN", "LIGA", "INTERN"]).optional(),
    label: z
      .string()
      .trim()
      .max(80)
      .transform((v) => (v === "" ? null : v)),
    customerEmail: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => (v === "" ? null : v)),
    pricing: z.enum(["RULES", "MANUAL"]).optional(),
    manualGross: z.string().trim().optional(),
    paymentMethod: z.enum(["cash", "transfer"]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "INVOICE" && !v.customerEmail) {
      ctx.addIssue({ code: "custom", message: "Kunden-E-Mail angeben." });
    }
    if (v.mode === "INVOICE" && v.pricing === "MANUAL" && !v.manualGross) {
      ctx.addIssue({ code: "custom", message: "Betrag angeben." });
    }
  });

export async function createManualBookingAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const staff = await requireStaff();
  const parsed = manualSchema.safeParse({
    venueId: formData.get("venueId"),
    courtId: formData.get("courtId"),
    date: formData.get("date"),
    time: formData.get("time"),
    durationMin: formData.get("durationMin"),
    mode: formData.get("mode"),
    usageType: formData.get("usageType") ?? undefined,
    label: formData.get("label") ?? "",
    customerEmail: formData.get("customerEmail") ?? "",
    pricing: formData.get("pricing") ?? undefined,
    manualGross: formData.get("manualGross") ?? undefined,
    paymentMethod: formData.get("paymentMethod") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  let manualGrossCents: number | null = null;
  if (parsed.data.mode === "INVOICE" && parsed.data.pricing === "MANUAL") {
    manualGrossCents = parseEuroToCents(parsed.data.manualGross ?? "");
    if (manualGrossCents === null || manualGrossCents <= 0) {
      return { error: "Betrag nicht lesbar (z. B. 34,00)." };
    }
  }

  try {
    const result = await createManualBooking(
      staff.ctx,
      {
        venueId: parsed.data.venueId,
        courtId: parsed.data.courtId,
        date: parsed.data.date,
        time: parsed.data.time,
        durationMin: parsed.data.durationMin,
        mode: parsed.data.mode,
        usageType: parsed.data.usageType,
        label: parsed.data.label,
        customerEmail: parsed.data.customerEmail,
        pricing: parsed.data.pricing,
        manualGrossCents,
        paymentMethod: parsed.data.paymentMethod,
      },
      staff.userId,
    );
    revalidatePath("/admin/kalender");
    return {
      ok: result.invoiceNumber
        ? `Belegung angelegt – Rechnung ${result.invoiceNumber} erstellt.`
        : "Belegung angelegt.",
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

const moveSchema = z.object({
  bookingId: z.string().min(1),
  courtId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function moveBookingAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const staff = await requireStaff();
  const parsed = moveSchema.safeParse({
    bookingId: formData.get("bookingId"),
    courtId: formData.get("courtId"),
    date: formData.get("date"),
    time: formData.get("time"),
  });
  if (!parsed.success) return { error: "Ungültige Eingabe." };
  try {
    await moveBooking(staff.ctx, parsed.data, staff.userId);
    revalidatePath("/admin/kalender");
    return { ok: "Belegung verschoben." };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function cancelBookingAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const staff = await requireStaff();
  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) return { error: "Belegung fehlt." };
  try {
    const { orderId } = await adminCancelBooking(
      staff.ctx,
      bookingId,
      staff.userId,
    );
    revalidatePath("/admin/kalender");
    return {
      ok: orderId
        ? "Storniert. Erstattung bei Bedarf über die Bestellung anstoßen."
        : "Storniert.",
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function noShowAction(
  _prev: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const staff = await requireStaff();
  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) return { error: "Belegung fehlt." };
  try {
    await markNoShow(staff.ctx, bookingId, staff.userId);
    revalidatePath("/admin/kalender");
    return { ok: "Als No-Show markiert." };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}
