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

const blockSchema = z.object({
  venueId: z.string().min(1),
  courtId: z.string().min(1, "Platz wählen."),
  type: z.enum(["VEREIN", "LIGA", "WARTUNG", "EVENT", "GESPERRT"]),
  title: z.string().trim().min(2, "Titel angeben.").max(120),
  clubId: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum angeben."),
  timeFrom: z.string().regex(/^\d{2}:\d{2}$/, "Beginn angeben."),
  timeTo: z.string().regex(/^\d{2}:\d{2}$/, "Ende angeben."),
  weekdays: z.array(z.coerce.number().min(1).max(7)).max(7),
  untilDate: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

function parse(formData: FormData) {
  return blockSchema.safeParse({
    venueId: formData.get("venueId"),
    courtId: formData.get("courtId"),
    type: formData.get("type"),
    title: formData.get("title"),
    clubId: formData.get("clubId") ?? "",
    date: formData.get("date"),
    timeFrom: formData.get("timeFrom"),
    timeTo: formData.get("timeTo"),
    weekdays: formData.getAll("weekdays"),
    untilDate: formData.get("untilDate") ?? "",
  });
}

function summarize(result: MaterializeResult): string {
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
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  try {
    const { materialized } = await createBlock(
      staff.ctx,
      parsed.data,
      staff.userId,
    );
    revalidatePath("/admin/sperren");
    return { ok: summarize(materialized) };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function updateBlockAction(
  _prev: BlockActionState,
  formData: FormData,
): Promise<BlockActionState> {
  const staff = await requireStaff();
  const blockId = String(formData.get("blockId") ?? "");
  const parsed = parse(formData);
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
      parsed.data,
      staff.userId,
    );
    revalidatePath("/admin/sperren");
    return { ok: summarize(materialized) };
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
