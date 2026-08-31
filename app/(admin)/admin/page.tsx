import { redirect } from "next/navigation";

import { auth } from "@/src/auth";
import { STAFF_ROLES } from "@/src/auth/config";

export default async function AdminPage() {
  // Die Middleware schützt /admin bereits; hier zusätzlich serverseitig
  // prüfen, damit der Guard nicht allein an der Middleware hängt.
  const session = await auth();
  const isStaff = session?.user.memberships.some((m) =>
    STAFF_ROLES.includes(m.role),
  );
  if (!isStaff) {
    redirect("/konto");
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Backoffice</h1>
      <p className="text-muted-foreground text-sm">
        Admin-Bereich – Ausbau folgt ab Sprint 1 (Ticket 1.3).
      </p>
    </main>
  );
}
