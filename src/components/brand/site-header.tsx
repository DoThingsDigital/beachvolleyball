import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/src/auth";
import { STAFF_ROLES } from "@/src/auth/config";

// Gemeinsamer Marken-Header (CI): Logo führt immer zur Startseite.
// Staff-Rollen sehen zusätzlich den Backoffice-Einstieg (K3) – die
// Rolle steckt im Session-JWT, der Check kostet keinen DB-Zugriff.
export async function SiteHeader() {
  const session = await auth();
  const isStaff =
    session?.user?.memberships.some((m) => STAFF_ROLES.includes(m.role)) ??
    false;

  return (
    <header className="bg-background border-divider-warm sticky top-0 z-20 border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label="Zur Startseite">
          <Logo small />
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-semibold sm:flex">
          <Link href="/kalender" className="hover:text-coral-deep">
            Slots
          </Link>
          <Link href="/vorverkauf" className="hover:text-coral-deep">
            Dauerplätze
          </Link>
          <Link href="/konto" className="hover:text-coral-deep">
            Konto
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/konto"
            className="text-sm font-semibold sm:hidden hover:text-coral-deep"
          >
            Konto
          </Link>
          {isStaff ? (
            <Link
              href="/admin"
              data-testid="backoffice-link"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Backoffice
            </Link>
          ) : null}
          <Link href="/kalender" className={buttonVariants({ size: "sm" })}>
            Feld buchen
          </Link>
        </div>
      </div>
    </header>
  );
}
