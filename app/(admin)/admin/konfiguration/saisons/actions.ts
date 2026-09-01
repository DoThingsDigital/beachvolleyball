"use server";

import { TZDate } from "@date-fns/tz";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import type { CrudActionState } from "../_components/crud-form";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT.");

const seasonSchema = z
  .object({
    venueId: z.string().min(1),
    name: z.string().trim().min(1, "Name angeben.").max(80),
    startDate: isoDate,
    endDate: isoDate,
    presaleStart: z.union([isoDate, z.literal("")]),
    status: z.enum(["DRAFT", "PRESALE", "ACTIVE", "CLOSED"]),
    subscriptionDiscountBp: z.coerce.number().int().min(0).max(5000),
  })
  .refine((v) => v.startDate < v.endDate, {
    message: "Saisonende muss nach dem Beginn liegen.",
  });

// Kalendertag (lokal Europe/Berlin, 00:00) → UTC-Instant
function localMidnight(date: string, timezone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, 0, 0, timezone).getTime());
}

function parse(formData: FormData) {
  return seasonSchema.safeParse({
    venueId: formData.get("venueId"),
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    presaleStart: formData.get("presaleStart") ?? "",
    status: formData.get("status"),
    subscriptionDiscountBp: formData.get("subscriptionDiscountBp"),
  });
}

export async function createSeason(
  _prev: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const staff = await requireStaff();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const repos = createRepositories(staff.ctx);
  const venue = await repos.venues.findById(parsed.data.venueId);
  if (!venue) return { error: "Standort nicht gefunden." };

  const d = parsed.data;
  const season = await repos.seasons.create({
    venueId: venue.id,
    name: d.name,
    startDate: localMidnight(d.startDate, venue.timezone),
    endDate: localMidnight(d.endDate, venue.timezone),
    presaleStart: d.presaleStart ? localMidnight(d.presaleStart, venue.timezone) : null,
    status: d.status,
    subscriptionDiscountBp: d.subscriptionDiscountBp,
  });
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "Season",
    entityId: season.id,
    action: "season.create",
    diff: { new: d },
  });
  revalidatePath("/admin/konfiguration/saisons");
  return { ok: true };
}

export async function updateSeason(
  _prev: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const parsed = parse(formData);
  if (!id || !parsed.success) {
    return {
      error: parsed.success
        ? "ID fehlt."
        : (parsed.error.issues[0]?.message ?? "Ungültige Eingabe."),
    };
  }
  const repos = createRepositories(staff.ctx);
  const venue = await repos.venues.findById(parsed.data.venueId);
  if (!venue) return { error: "Standort nicht gefunden." };

  const d = parsed.data;
  const ok = await repos.seasons.update(id, {
    name: d.name,
    startDate: localMidnight(d.startDate, venue.timezone),
    endDate: localMidnight(d.endDate, venue.timezone),
    presaleStart: d.presaleStart ? localMidnight(d.presaleStart, venue.timezone) : null,
    status: d.status,
    subscriptionDiscountBp: d.subscriptionDiscountBp,
  });
  if (!ok) return { error: "Saison nicht gefunden." };
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "Season",
    entityId: id,
    action: "season.update",
    diff: { new: d },
  });
  revalidatePath("/admin/konfiguration/saisons");
  return { ok: true };
}
