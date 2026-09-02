"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import { DomainError } from "@/src/domain/errors";
import {
  createBlock,
  endBlock,
  updateBlock,
  type MaterializeResult,
} from "@/src/services/blocks";

export type BlockActionState = { ok?: string; error?: string };

const blockBase = z
  .object({
    venueId: z.string().min(1),
    type: z.enum(["VEREIN", "LIGA", "WARTUNG", "EVENT", "GESPERRT"]),
    title: z.string().trim().min(2, "Titel angeben.").max(120),
    clubId: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum angeben."),
    // gesetzt und nach "date" = ganztägige Sperre über den Zeitraum
    dateTo: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    timeFrom: z.string(),
    timeTo: z.string(),
    weekdays: z.array(z.coerce.number().min(1).max(7)).max(7),
    untilDate: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    memberSelfBooking: z.boolean(),
    releaseMode: z.enum(["VENUE", "CUSTOM", "NONE"]),
    releaseHours: z
      .string()
      .transform((v) => (v === "" ? null : Number(v)))
      .nullable(),
  })
  .superRefine((v, ctx) => {
    const isRange = Boolean(v.dateTo && v.dateTo !== v.date);
    if (isRange) return; // Uhrzeiten irrelevant, Rest prüft der Service
    if (!/^\d{2}:\d{2}$/.test(v.timeFrom)) {
      ctx.addIssue({ code: "custom", message: "Beginn angeben.", path: ["timeFrom"] });
    }
    if (!/^\d{2}:\d{2}$/.test(v.timeTo)) {
      ctx.addIssue({ code: "custom", message: "Ende angeben.", path: ["timeTo"] });
    }
  });

const createSchema = z
  .object({
    courtIds: z
      .array(z.string().min(1))
      .min(1, "Mindestens einen Platz wählen.")
      .max(50),
  })
  .and(blockBase);

const updateSchema = z
  .object({ courtId: z.string().min(1, "Platz wählen.") })
  .and(blockBase);

function baseFields(formData: FormData) {
  return {
    venueId: formData.get("venueId"),
    type: formData.get("type"),
    title: formData.get("title"),
    clubId: formData.get("clubId") ?? "",
    date: formData.get("date"),
    dateTo: formData.get("dateTo") ?? "",
    timeFrom: formData.get("timeFrom") ?? "",
    timeTo: formData.get("timeTo") ?? "",
    weekdays: formData.getAll("weekdays"),
    untilDate: formData.get("untilDate") ?? "",
    memberSelfBooking: formData.get("memberSelfBooking") === "on",
    releaseMode: formData.get("releaseMode") ?? "VENUE",
    releaseHours: formData.get("releaseHours") ?? "",
  };
}

/** Auto-Freigabe-Auswahl → releaseHoursBefore (null = Venue-Default,
 *  0 = nie/fest reserviert, sonst Stunden). */
function resolveReleaseHours(data: {
  releaseMode: "VENUE" | "CUSTOM" | "NONE";
  releaseHours: number | null;
}): number | null {
  if (data.releaseMode === "NONE") return 0;
  if (data.releaseMode === "CUSTOM") {
    const hours = Math.round(data.releaseHours ?? 0);
    return hours > 0 ? hours : null;
  }
  return null;
}

function summarize(
  result: MaterializeResult,
  memberSelfBooking: boolean,
): string {
  if (memberSelfBooking) {
    return (
      "Gespeichert – Mitglieder-Buchungsfenster aktiv" +
      (result.cancelled > 0
        ? ` (${result.cancelled} zuvor materialisierte Termine storniert)`
        : "") +
      "."
    );
  }
  const parts = [`${result.created + result.kept} Termine aktiv`];
  if (result.created > 0) parts.push(`${result.created} neu`);
  if (result.cancelled > 0) parts.push(`${result.cancelled} storniert`);
  if (result.skippedConflicts.length > 0) {
    parts.push(
      `${result.skippedConflicts.length} wegen bestehender Buchungen übersprungen`,
    );
  }
  return `Gespeichert – ${parts.join(", ")}.`;
}

export async function createBlockAction(
  _prev: BlockActionState,
  formData: FormData,
): Promise<BlockActionState> {
  const staff = await requireStaff();
  const parsed = createSchema.safeParse({
    ...baseFields(formData),
    courtIds: formData.getAll("courtIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const courtIds = [...new Set(parsed.data.courtIds)];
  const total: MaterializeResult = {
    created: 0,
    cancelled: 0,
    kept: 0,
    skippedConflicts: [],
  };
  let done = 0;
  try {
    for (const courtId of courtIds) {
      const { materialized } = await createBlock(
        staff.ctx,
        {
          ...parsed.data,
          courtId,
          releaseHoursBefore: resolveReleaseHours(parsed.data),
        },
        staff.userId,
      );
      done += 1;
      total.created += materialized.created;
      total.cancelled += materialized.cancelled;
      total.kept += materialized.kept;
      total.skippedConflicts.push(...materialized.skippedConflicts);
    }
    revalidatePath("/admin/sperren");
    const prefix = courtIds.length > 1 ? `${courtIds.length} Sperren angelegt – ` : "";
    return {
      ok: prefix + summarize(total, parsed.data.memberSelfBooking),
    };
  } catch (error) {
    revalidatePath("/admin/sperren");
    if (error instanceof DomainError) {
      return {
        error:
          done > 0
            ? `${error.message} (${done} von ${courtIds.length} Sperren wurden bereits angelegt – Liste prüfen.)`
            : error.message,
      };
    }
    throw error;
  }
}

export async function updateBlockAction(
  _prev: BlockActionState,
  formData: FormData,
): Promise<BlockActionState> {
  const staff = await requireStaff();
  const blockId = String(formData.get("blockId") ?? "");
  const parsed = updateSchema.safeParse({
    ...baseFields(formData),
    courtId: formData.get("courtId"),
  });
  if (!blockId || !parsed.success) {
    return {
      error: parsed.success
        ? "Sperre fehlt."
        : (parsed.error.issues[0]?.message ?? "Ungültige Eingabe."),
    };
  }
  try {
    const materialized = await updateBlock(
      staff.ctx,
      blockId,
      { ...parsed.data, releaseHoursBefore: resolveReleaseHours(parsed.data) },
      staff.userId,
    );
    revalidatePath("/admin/sperren");
    return { ok: summarize(materialized, parsed.data.memberSelfBooking) };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function endBlockAction(
  _prev: BlockActionState,
  formData: FormData,
): Promise<BlockActionState> {
  const staff = await requireStaff();
  const blockId = String(formData.get("blockId") ?? "");
  if (!blockId) return { error: "Sperre fehlt." };
  try {
    const { cancelled } = await endBlock(staff.ctx, blockId, staff.userId);
    revalidatePath("/admin/sperren");
    return { ok: `Sperre beendet – ${cancelled} zukünftige Termine storniert.` };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}
