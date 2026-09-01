"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import {
  revokeClubAdmin,
  setClubAdminByEmail,
} from "@/src/db/club-memberships";
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

// --- Vereins-Admins (4.6-Nachtrag): Betreiber ernennt/entzieht -------------

export type ClubAdminAppointState = { ok?: string; error?: string };

const appointSchema = z.object({
  clubId: z.string().min(1),
  email: z.email("Gültige E-Mail angeben."),
});

export async function appointClubAdmin(
  _prev: ClubAdminAppointState,
  formData: FormData,
): Promise<ClubAdminAppointState> {
  const staff = await requireStaff();
  const parsed = appointSchema.safeParse({
    clubId: formData.get("clubId"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  const result = await setClubAdminByEmail(
    staff.ctx,
    parsed.data.clubId,
    parsed.data.email,
    staff.userId,
  );
  if (result === "not_found") {
    return {
      error:
        "Kein Konto mit dieser E-Mail – die Person muss sich zuerst registrieren.",
    };
  }
  await createRepositories(staff.ctx).auditLogs.create({
    actorUserId: staff.userId,
    entity: "Club",
    entityId: parsed.data.clubId,
    action: "club.appoint-admin",
    diff: { email: parsed.data.email },
  });
  revalidatePath("/admin/konfiguration/vereine");
  return { ok: "Vereins-Admin ernannt – die Person sieht jetzt /verein." };
}

const revokeSchema = z.object({
  clubId: z.string().min(1),
  membershipId: z.string().min(1),
});

export async function revokeClubAdminAction(
  _prev: ClubAdminAppointState,
  formData: FormData,
): Promise<ClubAdminAppointState> {
  const staff = await requireStaff();
  const parsed = revokeSchema.safeParse({
    clubId: formData.get("clubId"),
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) return { error: "Ungültige Anfrage." };

  const ok = await revokeClubAdmin(
    staff.ctx,
    parsed.data.clubId,
    parsed.data.membershipId,
  );
  if (!ok) return { error: "Eintrag nicht gefunden." };
  await createRepositories(staff.ctx).auditLogs.create({
    actorUserId: staff.userId,
    entity: "Club",
    entityId: parsed.data.clubId,
    action: "club.revoke-admin",
    diff: { membershipId: parsed.data.membershipId },
  });
  revalidatePath("/admin/konfiguration/vereine");
  return { ok: "Admin-Rechte entzogen (Mitgliedschaft bleibt aktiv)." };
}
