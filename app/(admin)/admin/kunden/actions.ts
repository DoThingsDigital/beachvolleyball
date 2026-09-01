"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import {
  findCustomerDetail,
  updateCustomerNotes,
} from "@/src/db/customers";
import { anonymizeUser } from "@/src/db/privacy";
import { createRepositories } from "@/src/db/repositories";
import { DomainError } from "@/src/domain/errors";
import { cancelSubscription } from "@/src/services/subscriptions";

export type CustomerActionState = {
  ok?: string;
  error?: string;
};

const notesSchema = z.object({
  userId: z.string().min(1),
  notes: z.string().max(2000),
});

export async function saveCustomerNotes(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const staff = await requireStaff();
  const parsed = notesSchema.safeParse({
    userId: formData.get("userId"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: "Ungültige Eingabe." };

  const membership = await findCustomerDetail(staff.ctx, parsed.data.userId);
  if (!membership) return { error: "Kunde nicht gefunden." };

  await updateCustomerNotes(
    parsed.data.userId,
    parsed.data.notes.trim() === "" ? null : parsed.data.notes.trim(),
  );
  revalidatePath(`/admin/kunden/${parsed.data.userId}`);
  return { ok: "Notiz gespeichert." };
}

const cancelSchema = z.object({
  userId: z.string().min(1),
  subscriptionId: z.string().min(1),
  reason: z.string().trim().min(3, "Bitte einen Grund angeben.").max(200),
  withRefund: z.enum(["ja", "nein"]),
});

export async function adminCancelSubscription(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const staff = await requireStaff();
  const parsed = cancelSchema.safeParse({
    userId: formData.get("userId"),
    subscriptionId: formData.get("subscriptionId"),
    reason: formData.get("reason"),
    withRefund: formData.get("withRefund"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  try {
    const result = await cancelSubscription(staff.ctx, {
      subscriptionId: parsed.data.subscriptionId,
      reason: parsed.data.reason,
      actorUserId: staff.userId,
      withRefund: parsed.data.withRefund === "ja",
    });
    const repos = createRepositories(staff.ctx);
    await repos.auditLogs.create({
      actorUserId: staff.userId,
      entity: "Subscription",
      entityId: parsed.data.subscriptionId,
      action: "subscription.cancel",
      diff: {
        reason: parsed.data.reason,
        cancelledCount: result.cancelledCount,
        refundCents: result.refundCents,
        creditNote: result.creditNoteNumber,
      },
    });
    revalidatePath(`/admin/kunden/${parsed.data.userId}`);
    return {
      ok:
        result.refundCents > 0 && result.creditNoteNumber
          ? `Gekündigt: ${result.cancelledCount} Termine storniert, Gutschrift ${result.creditNoteNumber}.`
          : `Gekündigt: ${result.cancelledCount} Termine storniert, keine Erstattung.`,
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

// --- Anonymisierung (Ticket 6.5, A5) ---------------------------------------

const anonymizeSchema = z.object({
  userId: z.string().min(1),
  confirm: z.boolean().refine((v) => v === true, "Bitte bestätigen (Checkbox)."),
});

export async function anonymizeCustomer(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const staff = await requireStaff();
  const parsed = anonymizeSchema.safeParse({
    userId: formData.get("userId"),
    confirm: formData.get("confirm") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  const result = await anonymizeUser(staff.ctx, parsed.data.userId);
  if (!result) return { error: "Kunde nicht gefunden." };
  if (!result.ok) {
    return {
      error:
        result.blocker === "FUTURE_BOOKINGS"
          ? "Der Kunde hat zukünftige aktive Buchungen – erst stornieren."
          : "Der Kunde hat laufende Dauerplätze – erst kündigen.",
    };
  }

  const repos = createRepositories(staff.ctx);
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "User",
    entityId: parsed.data.userId,
    action: "user.anonymize",
    diff: { alreadyAnonymized: result.alreadyAnonymized },
  });
  revalidatePath(`/admin/kunden/${parsed.data.userId}`);
  return {
    ok: result.alreadyAnonymized
      ? "Kunde war bereits anonymisiert."
      : "Kunde anonymisiert. Rechnungen und Belegungen bleiben erhalten.",
  };
}
