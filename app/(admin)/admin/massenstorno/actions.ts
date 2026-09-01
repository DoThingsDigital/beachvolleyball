"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formatCents } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { DomainError } from "@/src/domain/errors";
import {
  executeMassCancellation,
  previewMassCancellation,
} from "@/src/services/mass-cancellation";

export type MassCancelState = {
  ok?: string;
  error?: string;
  preview?: {
    affected: number;
    customers: number;
    paidFormatted: string;
  };
  /** Eingaben zurückspiegeln: React 19 resettet das Formular nach jeder
   *  Action; diese Werte werden als defaultValue wieder eingesetzt. */
  values?: {
    dateFrom: string;
    dateTo: string;
    reason: string;
    refundMode: string;
    courtIds: string[];
  };
};

function echoValues(formData: FormData): NonNullable<MassCancelState["values"]> {
  return {
    dateFrom: String(formData.get("dateFrom") ?? ""),
    dateTo: String(formData.get("dateTo") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    refundMode: String(formData.get("refundMode") ?? "MONEY"),
    courtIds: formData.getAll("courtIds").map(String),
  };
}

const baseSchema = z.object({
  venueId: z.string().min(1),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Zeitraum angeben."),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Zeitraum angeben."),
  courtIds: z.array(z.string().min(1)),
});

const executeSchema = baseSchema.extend({
  reason: z.string().trim().min(3, "Grund angeben.").max(200),
  refundMode: z.enum(["MONEY", "CREDIT", "NONE"]),
  confirm: z
    .boolean()
    .refine((v) => v === true, "Bitte die Ausführung bestätigen (Checkbox)."),
});

function parseBase(formData: FormData) {
  return {
    venueId: formData.get("venueId"),
    dateFrom: formData.get("dateFrom"),
    dateTo: formData.get("dateTo"),
    courtIds: formData.getAll("courtIds"),
  };
}

export async function previewMassCancelAction(
  _prev: MassCancelState,
  formData: FormData,
): Promise<MassCancelState> {
  const staff = await requireStaff();
  const values = echoValues(formData);
  const parsed = baseSchema.safeParse(parseBase(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe.",
      values,
    };
  }
  try {
    const preview = await previewMassCancellation(staff.ctx, {
      venueId: parsed.data.venueId,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      courtIds: parsed.data.courtIds,
    });
    return {
      preview: {
        affected: preview.affected,
        customers: preview.customers,
        paidFormatted: formatCents(preview.paidCents),
      },
      values,
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, values };
    throw error;
  }
}

export async function executeMassCancelAction(
  _prev: MassCancelState,
  formData: FormData,
): Promise<MassCancelState> {
  const staff = await requireStaff();
  const values = echoValues(formData);
  const parsed = executeSchema.safeParse({
    ...parseBase(formData),
    reason: formData.get("reason"),
    refundMode: formData.get("refundMode"),
    confirm: formData.get("confirm") === "on",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe.",
      values,
    };
  }
  try {
    const result = await executeMassCancellation(
      staff.ctx,
      {
        venueId: parsed.data.venueId,
        dateFrom: parsed.data.dateFrom,
        dateTo: parsed.data.dateTo,
        courtIds: parsed.data.courtIds,
        reason: parsed.data.reason,
        refundMode: parsed.data.refundMode,
      },
      staff.userId,
    );
    revalidatePath("/admin/massenstorno");
    const parts = [`${result.cancelled} Termine storniert`];
    if (result.refundedCents > 0) {
      parts.push(`${formatCents(result.refundedCents)} erstattet`);
    }
    if (result.creditedCents > 0) {
      parts.push(`${formatCents(result.creditedCents)} als Guthaben gutgeschrieben`);
    }
    parts.push(`${result.emailsSent} Sammelmails verschickt`);
    if (result.manualFollowUps.length > 0) {
      parts.push(
        `${result.manualFollowUps.length} manuell bezahlte Bestellungen zur Nacharbeit`,
      );
    }
    return { ok: parts.join(", ") + "." };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, values };
    throw error;
  }
}
