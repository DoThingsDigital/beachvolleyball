"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import type { CrudActionState } from "../_components/crud-form";

const courtSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().trim().min(1, "Name angeben.").max(50),
  sortOrder: z.coerce.number().int().min(0).max(999),
  courtGroup: z
    .string()
    .trim()
    .max(50)
    .transform((v) => (v === "" ? null : v)),
  sport: z.enum(["BEACH", "TENNIS"]),
  active: z.coerce.boolean(),
});

function parse(formData: FormData) {
  return courtSchema.safeParse({
    venueId: formData.get("venueId"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder"),
    courtGroup: formData.get("courtGroup") ?? "",
    sport: formData.get("sport"),
    active: formData.get("active") === "on",
  });
}

export async function createCourt(
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

  const { venueId, ...data } = parsed.data;
  const court = await repos.courts.create({ ...data, venueId });
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "Court",
    entityId: court.id,
    action: "court.create",
    diff: { new: { ...data, venueId } },
  });
  revalidatePath("/admin/konfiguration/plaetze");
  return { ok: true };
}

export async function updateCourt(
  _prev: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const parsed = parse(formData);
  if (!id || !parsed.success) {
    return { error: parsed.success ? "ID fehlt." : (parsed.error.issues[0]?.message ?? "Ungültige Eingabe.") };
  }
  const repos = createRepositories(staff.ctx);
  const { venueId: _v, ...data } = parsed.data;
  void _v;
  const ok = await repos.courts.update(id, data);
  if (!ok) return { error: "Platz nicht gefunden." };
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "Court",
    entityId: id,
    action: "court.update",
    diff: { new: data },
  });
  revalidatePath("/admin/konfiguration/plaetze");
  return { ok: true };
}
