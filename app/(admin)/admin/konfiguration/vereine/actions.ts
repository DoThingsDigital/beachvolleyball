"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import type { CrudActionState } from "../_components/crud-form";

const clubSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().trim().min(1, "Name angeben.").max(100),
  contactEmail: z.email("Gültige Kontakt-E-Mail angeben."),
  active: z.coerce.boolean(),
});

function parse(formData: FormData) {
  return clubSchema.safeParse({
    venueId: formData.get("venueId"),
    name: formData.get("name"),
    contactEmail: formData.get("contactEmail"),
    active: formData.get("active") === "on",
  });
}

export async function createClub(
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

  const club = await repos.clubs.create(parsed.data);
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "Club",
    entityId: club.id,
    action: "club.create",
    diff: { new: parsed.data },
  });
  revalidatePath("/admin/konfiguration/vereine");
  return { ok: true };
}

export async function updateClub(
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
  const { venueId: _v, ...data } = parsed.data;
  void _v;
  const ok = await repos.clubs.update(id, data);
  if (!ok) return { error: "Verein nicht gefunden." };
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "Club",
    entityId: id,
    action: "club.update",
    diff: { new: data },
  });
  revalidatePath("/admin/konfiguration/vereine");
  return { ok: true };
}
