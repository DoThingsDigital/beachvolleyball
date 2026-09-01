"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import type { CrudActionState } from "../_components/crud-form";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const entitySchema = z.object({
  name: z.string().trim().min(1, "Name angeben.").max(120),
  legalForm: z.string().trim().min(1, "Rechtsform angeben.").max(40),
  street: z.string().trim().min(1, "Straße angeben.").max(120),
  zip: z.string().trim().min(1, "PLZ angeben.").max(10),
  city: z.string().trim().min(1, "Ort angeben.").max(80),
  country: z.string().trim().length(2, "Ländercode (z. B. DE) angeben."),
  taxNumber: optional(40),
  vatId: optional(20),
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Z]{1,6}$/, "Präfix: 1–6 Großbuchstaben."),
  defaultTaxRateBp: z.coerce.number().int().min(0).max(3000),
  smallBusiness: z.coerce.boolean(),
  email: z.email("Gültige E-Mail angeben."),
  phone: optional(30),
  website: optional(120),
  active: z.coerce.boolean(),
});

function parse(formData: FormData) {
  return entitySchema.safeParse({
    name: formData.get("name"),
    legalForm: formData.get("legalForm"),
    street: formData.get("street"),
    zip: formData.get("zip"),
    city: formData.get("city"),
    country: formData.get("country"),
    taxNumber: formData.get("taxNumber") ?? "",
    vatId: formData.get("vatId") ?? "",
    invoicePrefix: formData.get("invoicePrefix"),
    defaultTaxRateBp: formData.get("defaultTaxRateBp"),
    smallBusiness: formData.get("smallBusiness") === "on",
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    website: formData.get("website") ?? "",
    active: formData.get("active") === "on",
  });
}

export async function createLegalEntity(
  _prev: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const staff = await requireStaff();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const repos = createRepositories(staff.ctx);
  const entity = await repos.legalEntities.create(parsed.data);
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "LegalEntity",
    entityId: entity.id,
    action: "legalEntity.create",
    diff: { new: parsed.data },
  });
  revalidatePath("/admin/konfiguration/aussteller");
  return { ok: true };
}

export async function updateLegalEntity(
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
  const ok = await repos.legalEntities.update(id, parsed.data);
  if (!ok) return { error: "Aussteller nicht gefunden." };
  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "LegalEntity",
    entityId: id,
    action: "legalEntity.update",
    diff: { new: parsed.data },
  });
  revalidatePath("/admin/konfiguration/aussteller");
  return { ok: true };
}

// B4: Aussteller-Wechsel am Standort – wirkt nur auf neue Rechnungen.
export async function switchVenueLegalEntity(
  _prev: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const staff = await requireStaff();
  const venueId = String(formData.get("venueId") ?? "");
  const legalEntityId = String(formData.get("legalEntityId") ?? "");
  if (!venueId || !legalEntityId) return { error: "Ungültige Auswahl." };

  const repos = createRepositories(staff.ctx);
  const entity = await repos.legalEntities.findById(legalEntityId);
  if (!entity?.active) {
    return { error: "Nur aktive Aussteller können zugewiesen werden." };
  }
  const ok = await repos.venues.setLegalEntity(venueId, legalEntityId);
  if (!ok) return { error: "Standort nicht gefunden." };

  await repos.auditLogs.create({
    actorUserId: staff.userId,
    entity: "Venue",
    entityId: venueId,
    action: "venue.legalEntity.switch",
    diff: { new: { legalEntityId, name: entity.name } },
  });
  revalidatePath("/admin/konfiguration/aussteller");
  return { ok: true };
}
