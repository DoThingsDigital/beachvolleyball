"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { WEEKDAYS } from "./weekdays";

export type ConfigFormState = {
  ok?: boolean;
  error?: string;
};

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Zeit im Format HH:MM angeben.");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Schließtage im Format JJJJ-MM-TT angeben.");

const configSchema = z
  .object({
    venueId: z.string().min(1),
    slotMinutes: z.coerce.number().int().refine((v) => [15, 30, 60].includes(v), {
      message: "Raster muss 15, 30 oder 60 Minuten sein.",
    }),
    minDurationMin: z.coerce.number().int().min(15).max(480),
    maxDurationMin: z.coerce.number().int().min(15).max(480),
    leadTimeMin: z.coerce.number().int().min(0).max(10080),
    horizonDays: z.coerce.number().int().min(1).max(365),
    memberHorizonDays: z.coerce.number().int().min(1).max(365),
    holdMinutes: z.coerce.number().int().min(5).max(120),
    cancelHours: z.coerce.number().int().min(0).max(720),
    cancelRefundMode: z.enum(["MONEY", "CREDIT", "NONE"]),
    releaseHoursBefore: z.coerce.number().int().min(0).max(720),
    sepaLeadDays: z.coerce.number().int().min(0).max(60),
    closedDates: z.array(isoDate),
    openingHours: z.record(z.string(), z.array(z.tuple([timeString, timeString]))),
  })
  .refine((v) => v.minDurationMin <= v.maxDurationMin, {
    message: "Mindestdauer darf die Maximaldauer nicht überschreiten.",
  })
  .refine((v) => v.minDurationMin % v.slotMinutes === 0 && v.maxDurationMin % v.slotMinutes === 0, {
    message: "Min-/Max-Dauer müssen ins Raster passen.",
  });

// Felder, die im Audit-Diff verglichen werden
const AUDITED_FIELDS = [
  "slotMinutes",
  "minDurationMin",
  "maxDurationMin",
  "leadTimeMin",
  "horizonDays",
  "memberHorizonDays",
  "holdMinutes",
  "cancelHours",
  "cancelRefundMode",
  "releaseHoursBefore",
  "sepaLeadDays",
  "closedDates",
  "openingHours",
] as const;

function parseForm(formData: FormData) {
  const openingHours: Record<string, [string, string][]> = {};
  for (const [key] of WEEKDAYS) {
    if (formData.get(`open_${key}`) === "on") {
      const from = String(formData.get(`from_${key}`) ?? "");
      const to = String(formData.get(`to_${key}`) ?? "");
      openingHours[key] = [[from, to]];
    } else {
      openingHours[key] = [];
    }
  }

  const closedDates = String(formData.get("closedDates") ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return configSchema.safeParse({
    venueId: formData.get("venueId"),
    slotMinutes: formData.get("slotMinutes"),
    minDurationMin: formData.get("minDurationMin"),
    maxDurationMin: formData.get("maxDurationMin"),
    leadTimeMin: formData.get("leadTimeMin"),
    horizonDays: formData.get("horizonDays"),
    memberHorizonDays: formData.get("memberHorizonDays"),
    holdMinutes: formData.get("holdMinutes"),
    cancelHours: formData.get("cancelHours"),
    cancelRefundMode: formData.get("cancelRefundMode"),
    releaseHoursBefore: formData.get("releaseHoursBefore"),
    sepaLeadDays: formData.get("sepaLeadDays"),
    closedDates,
    openingHours,
  });
}

export async function updateVenueConfig(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  const staff = await requireStaff();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe.",
    };
  }

  // Öffnungsfenster je Tag validieren (von < bis)
  for (const [day, windows] of Object.entries(parsed.data.openingHours)) {
    for (const [from, to] of windows) {
      if (from >= to) {
        return { error: `Öffnungszeit ${day}: „von" muss vor „bis" liegen.` };
      }
    }
  }

  const repos = createRepositories(staff.ctx);
  const venue = await repos.venues.findById(parsed.data.venueId);
  if (!venue) {
    return { error: "Standort nicht gefunden." };
  }

  const { venueId, ...next } = parsed.data;
  void venueId;

  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const field of AUDITED_FIELDS) {
    const oldValue = venue[field];
    const newValue = next[field];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      diff[field] = { old: oldValue, new: newValue };
    }
  }

  if (Object.keys(diff).length === 0) {
    return { ok: true };
  }

  const updated = await repos.venues.update(venue.id, next);
  if (!updated) {
    return { error: "Speichern fehlgeschlagen." };
  }

  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "Venue",
    entityId: venue.id,
    action: "venue.config.update",
    diff: JSON.parse(JSON.stringify(diff)),
  });

  revalidatePath("/admin/konfiguration/standort");
  return { ok: true };
}
