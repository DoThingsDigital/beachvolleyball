import Link from "next/link";
import { cookies } from "next/headers";

import { logout } from "@/app/(public)/login/actions";
import { Button } from "@/components/ui/button";
import { VENUE_COOKIE } from "@/lib/venue-cookie";
import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { VenueSwitcher } from "./venue-switcher";

// K3: Bereiche wachsen mit den Tickets; noch nicht gebaute Ziele zeigen auf /admin.
const NAV = [
  { href: "/admin", label: "Übersicht" },
  { href: "/admin/kalender", label: "Kalender" },
  { href: "/admin/bestellungen", label: "Bestellungen" },
  { href: "/admin/kunden", label: "Kunden" },
  { href: "/admin/sperren", label: "Sperren" },
  { href: "/admin/konfiguration/standort", label: "Konfiguration" },
  { href: "/admin", label: "Reports", pending: "Sprint 6" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venues = await repos.venues.findMany();

  const cookieStore = await cookies();
  const cookieVenueId = cookieStore.get(VENUE_COOKIE)?.value;
  const selectedVenue =
    venues.find((v) => v.id === cookieVenueId) ?? venues[0] ?? null;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background sticky top-0 z-10 flex items-center justify-between gap-3 border-b p-3">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Zur Startseite" className="font-display text-lg font-extrabold">
            <span className="text-foreground">Picco</span>{" "}
            <span className="text-primary">Winter Beach</span>
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold">Backoffice</span>
          <VenueSwitcher
            venues={venues.map((v) => ({ id: v.id, name: v.name }))}
            selectedVenueId={selectedVenue?.id ?? ""}
          />
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Abmelden
          </Button>
        </form>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          aria-label="Admin-Navigation"
          className="bg-muted/30 flex gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-col md:border-r md:border-b-0"
        >
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-disabled={"pending" in item ? true : undefined}
              title={"pending" in item ? `Folgt: ${item.pending}` : undefined}
              className={
                "rounded-md px-3 py-2 text-sm whitespace-nowrap " +
                ("pending" in item
                  ? "text-muted-foreground cursor-default"
                  : "hover:bg-accent font-medium")
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
