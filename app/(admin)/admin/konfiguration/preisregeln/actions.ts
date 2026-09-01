"use server";

import { TZDate } from "@date-fns/tz";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";
import { DomainError } from "@/src/domain/errors";
import { computePrice } from "@/src/domain/pricing";
import { formatCents } from "@/lib/format";

import type { CrudActionState } from "../_components/crud-form";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Zeit im Format HH:MM angeben.");

const ruleSchema = z
  .object({
    venueId: z.string().min(1),
    seasonId: z.string().min(1),
    label: z.string().trim().min(1, "Bezeichnung angeben.").max(80),
    weekdays: z
      .string()
      .transform((v) =>
        v
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map(Number),
      )
      .pipe(
        z
          .array(z.number().int().min(1).max(7), {
            message: "Wochentage als Zahlen 1–7 angeben (1 = Mo).",
          })
          .min(1, "Mindestens einen Wochentag angeben."),
      ),
    timeFrom: time,
    timeTo: time,
    pricePerHourCents: z.coerce
      .number()
      .int()
      .min(1, "Preis in Cent angeben (z. B. 3400)."),
    memberPricePerHourCents: z.union([
      z.literal("").transform(() => null),
      z.coerce.number().int().min(1),
    ]),
    priority: z.coerce.number().int().min(0).max(999),
    courtId: z.string(), // "" = alle Plätze
    active: z.coerce.boolean(),
  })
  .refine((v) => v.timeFrom < v.timeTo, {
    message: "„Von“ muss vor „bis“ liegen (kein Fenster über Mitternacht).",
  });

function parseRule(formData: FormData) {
  return ruleSchema.safeParse({
    venueId: formData.get("venueId"),
    seasonId: formData.get("seasonId"),
    label: formData.get("label"),
    weekdays: formData.get("weekdays"),
    timeFrom: formData.get("timeFrom"),
    timeTo: formData.get("timeTo"),
    pricePerHourCents: formData.get("pricePerHourCents"),
    memberPricePerHourCents: formData.get("memberPricePerHourCents") ?? "",
    priority: formData.get("priority"),
    courtId: formData.get("courtId") ?? "",
    active: formData.get("active") === "on",
  });
}

function toData(d: z.infer<typeof ruleSchema>) {
  return {
    label: d.label,
    weekdays: [...new Set(d.weekdays)].sort(),
    timeFrom: d.timeFrom,
    timeTo: d.timeTo,
    pricePerHourCents: d.pricePerHourCents,
    memberPricePerHourCents: d.memberPricePerHourCents,
    priority: d.priority,
    courtIds: d.courtId ? [d.courtId] : [],
    active: d.active,
  };
}

export async function createPriceRule(
  _prev: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const staff = await requireStaff();
  const parsed = parseRule(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const repos = createRepositories(staff.ctx);
  const venue = await repos.venues.findById(parsed.data.venueId);
  if (!venue) return { error: "Standort nicht gefunden." };

  const rule = await repos.priceRules.create({
    ...toData(parsed.data),
    venueId: venue.id,
    seasonId: parsed.data.seasonId,
  });
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "PriceRule",
    entityId: rule.id,
    action: "priceRule.create",
    diff: { new: toData(parsed.data) },
  });
  revalidatePath("/admin/konfiguration/preisregeln");
  return { ok: true };
}

export async function updatePriceRule(
  _prev: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const parsed = parseRule(formData);
  if (!id || !parsed.success) {
    return {
      error: parsed.success
        ? "ID fehlt."
        : (parsed.error.issues[0]?.message ?? "Ungültige Eingabe."),
    };
  }
  const repos = createRepositories(staff.ctx);
  const ok = await repos.priceRules.update(id, toData(parsed.data));
  if (!ok) return { error: "Preisregel nicht gefunden." };
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "PriceRule",
    entityId: id,
    action: "priceRule.update",
    diff: { new: toData(parsed.data) },
  });
  revalidatePath("/admin/konfiguration/preisregeln");
  return { ok: true };
}

// --- Vorschau „Preis für Slot X" (C1/C2-Kontrolle für den Admin) -----------

export type PreviewState = {
  error?: string;
  result?: string;
  breakdown?: string[];
};

const previewSchema = z.object({
  venueId: z.string().min(1),
  seasonId: z.string().min(1),
  courtId: z.string().min(1, "Platz wählen."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum angeben."),
  startTime: time,
  durationMin: z.coerce.number().int().min(15).max(480),
  isMember: z.coerce.boolean(),
});

export async function previewPrice(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const staff = await requireStaff();
  const parsed = previewSchema.safeParse({
    venueId: formData.get("venueId"),
    seasonId: formData.get("seasonId"),
    courtId: formData.get("courtId"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    durationMin: formData.get("durationMin"),
    isMember: formData.get("isMember") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  const repos = createRepositories(staff.ctx);
  const venue = await repos.venues.findById(parsed.data.venueId);
  if (!venue) return { error: "Standort nicht gefunden." };
  const rules = await repos.priceRules.findManyForSeason(parsed.data.seasonId);

  const [y, mo, da] = parsed.data.date.split("-").map(Number);
  const [h, mi] = parsed.data.startTime.split(":").map(Number);
  const startAt = new Date(
    new TZDate(y!, mo! - 1, da!, h!, mi!, venue.timezone).getTime(),
  );
  const endAt = new Date(startAt.getTime() + parsed.data.durationMin * 60_000);

  try {
    const price = computePrice({
      slotMinutes: venue.slotMinutes,
      timezone: venue.timezone,
      rules,
      courtId: parsed.data.courtId,
      startAt,
      endAt,
      isMember: parsed.data.isMember,
    });
    const byRule = new Map<string, { label: string; cents: number }>();
    for (const slot of price.breakdown) {
      const rule = rules.find((r) => r.id === slot.ruleId);
      const key = slot.ruleId;
      const prev = byRule.get(key);
      byRule.set(key, {
        label: rule?.label ?? slot.ruleId,
        cents: (prev?.cents ?? 0) + slot.slotCents,
      });
    }
    return {
      result: formatCents(price.grossCents),
      breakdown: [...byRule.values()].map(
        (r) => `${r.label}: ${formatCents(r.cents)}`,
      ),
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        error:
          error.code === "NO_PRICE_RULE"
            ? "Für diesen Slot greift keine Preisregel."
            : error.message,
      };
    }
    throw error;
  }
}
