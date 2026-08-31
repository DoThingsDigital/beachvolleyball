import { redirect } from "next/navigation";

import { auth } from "@/src/auth";
import { STAFF_ROLES, type MembershipInfo } from "@/src/auth/config";
import type { TenantContext } from "@/src/db/tenant";

export type StaffSession = {
  userId: string;
  email: string | null | undefined;
  ctx: TenantContext;
  role: MembershipInfo["role"];
};

// Serverseitiger Guard für Admin-Seiten – zusätzlich zur Middleware, damit
// der Schutz nicht allein am Edge-Layer hängt. Liefert den TenantContext
// der ersten Staff-Mitgliedschaft (Multi-Org-Auswahl folgt mit P2).
export async function requireStaff(): Promise<StaffSession> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/admin");
  }
  const staffMembership = session.user.memberships.find((m) =>
    STAFF_ROLES.includes(m.role),
  );
  if (!staffMembership) {
    redirect("/konto");
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    ctx: { organisationId: staffMembership.organisationId },
    role: staffMembership.role,
  };
}
