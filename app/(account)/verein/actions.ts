"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/src/auth";
import {
  findClubsIAdminister,
  importClubMembers,
  setClubMembershipStatus,
} from "@/src/db/club-memberships";
import { getPublicShopContext } from "@/src/services/public-context";

export type ClubAdminActionState = {
  ok?: string;
  error?: string;
};

async function requireClubAdmin(clubId: string) {
  const session = await auth();
  if (!session?.user) return null;
  const shop = await getPublicShopContext();
  if (!shop) return null;
  const clubs = await findClubsIAdminister(shop.ctx, session.user.id);
  if (!clubs.some((c) => c.id === clubId)) return null;
  return { ctx: shop.ctx, userId: session.user.id };
}

const decideSchema = z.object({
  clubId: z.string().min(1),
  membershipId: z.string().min(1),
  decision: z.enum(["ACTIVE", "REJECTED"]),
});

export async function decideMembership(
  _prev: ClubAdminActionState,
  formData: FormData,
): Promise<ClubAdminActionState> {
  const parsed = decideSchema.safeParse({
    clubId: formData.get("clubId"),
    membershipId: formData.get("membershipId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return { error: "Ungültige Anfrage." };

  const admin = await requireClubAdmin(parsed.data.clubId);
  if (!admin) return { error: "Keine Berechtigung für diesen Verein." };

  const ok = await setClubMembershipStatus(
    admin.ctx,
    parsed.data.membershipId,
    parsed.data.clubId,
    parsed.data.decision,
    admin.userId,
  );
  if (!ok) return { error: "Anfrage nicht gefunden." };
  revalidatePath("/verein");
  return {
    ok:
      parsed.data.decision === "ACTIVE"
        ? "Mitgliedschaft freigegeben."
        : "Anfrage abgelehnt.",
  };
}

const importSchema = z.object({
  clubId: z.string().min(1),
  emails: z.string().min(3, "Bitte E-Mail-Adressen einfügen."),
});

export async function importMembers(
  _prev: ClubAdminActionState,
  formData: FormData,
): Promise<ClubAdminActionState> {
  const parsed = importSchema.safeParse({
    clubId: formData.get("clubId"),
    emails: formData.get("emails"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  const admin = await requireClubAdmin(parsed.data.clubId);
  if (!admin) return { error: "Keine Berechtigung für diesen Verein." };

  // CSV/Zeilen/Semikolon – alles, was nach E-Mail aussieht
  const emails = [
    ...new Set(
      parsed.data.emails
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)),
    ),
  ];
  if (emails.length === 0) {
    return { error: "Keine gültigen E-Mail-Adressen gefunden." };
  }

  const result = await importClubMembers(
    admin.ctx,
    parsed.data.clubId,
    emails,
    admin.userId,
  );
  revalidatePath("/verein");
  return {
    ok:
      `${result.activated} Mitglied(er) aktiviert.` +
      (result.unknown.length > 0
        ? ` Noch nicht registriert: ${result.unknown.join(", ")}`
        : ""),
  };
}
