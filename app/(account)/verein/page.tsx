import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDate, formatDateTime } from "@/lib/format";
import { auth } from "@/src/auth";
import {
  findClubMembers,
  findClubsIAdminister,
} from "@/src/db/club-memberships";
import { findUpcomingQuotaBookings } from "@/src/db/club-quota";
import { getPublicShopContext } from "@/src/services/public-context";

import { DecideButtons, ImportForm } from "./club-admin-forms";
import { QuotaList, type QuotaBooking } from "./quota-list";

// Vereins-Admin (Ticket 4.6): Anfragen freigeben/ablehnen, Mitgliederliste,
// Import per E-Mail-Liste. Zugriff nur für aktive Mitglieder mit isClubAdmin.

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Wartet auf Freigabe",
  ACTIVE: "Aktiv",
  EXPIRED: "Abgelaufen",
  REJECTED: "Abgelehnt",
};

export default async function VereinPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/verein");
  }

  const shop = await getPublicShopContext();
  if (!shop) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-4 p-4">
        <h1 className="text-2xl font-semibold">Vereinsverwaltung</h1>
        <p className="text-muted-foreground text-sm">
          Aktuell ist keine Saison aktiv.
        </p>
      </main>
    );
  }

  const clubs = await findClubsIAdminister(shop.ctx, session.user.id);
  if (clubs.length === 0) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-4 p-4">
        <h1 className="text-2xl font-semibold">Vereinsverwaltung</h1>
        <p className="text-muted-foreground text-sm">
          Du bist für keinen Verein als Vereins-Admin freigeschaltet.
        </p>
        <Link href="/konto" className="text-coral-deep text-sm font-bold hover:underline">
          ← Zurück zum Konto
        </Link>
      </main>
    );
  }

  const clubsWithMembers = await Promise.all(
    clubs.map(async (club) => ({
      club,
      members: await findClubMembers(shop.ctx, club.id),
      quota: (await findUpcomingQuotaBookings(shop.ctx, club.id)).map(
        (b): QuotaBooking => ({
          id: b.id,
          whenFormatted: formatDateTime(b.startAt),
          courtName: b.court.name,
          status: b.status as QuotaBooking["status"],
          clubConfirmed: b.clubConfirmedAt !== null,
          label: b.label ?? "",
        }),
      ),
    })),
  );

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-8 p-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Vereinsverwaltung</h1>
        <Link href="/konto" className="text-coral-deep text-sm font-bold hover:underline">
          ← Zum Konto
        </Link>
      </div>

      {clubsWithMembers.map(({ club, members, quota }) => {
        const pending = members.filter((m) => m.status === "PENDING");
        const rest = members.filter((m) => m.status !== "PENDING");
        return (
          <section key={club.id} className="flex flex-col gap-5">
            <h2 className="text-lg font-bold">{club.name}</h2>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Kontingent-Termine</h3>
              <QuotaList
                clubId={club.id}
                bookings={quota}
                releaseHours={shop.venue.releaseHoursBefore}
              />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                Offene Anfragen{pending.length > 0 ? ` (${pending.length})` : ""}
              </h3>
              {pending.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Keine offenen Anfragen.
                </p>
              ) : (
                <ul
                  className="flex flex-col gap-2"
                  data-testid="pending-requests"
                >
                  {pending.map((m) => (
                    <li
                      key={m.id}
                      className="bg-card flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
                    >
                      <div>
                        <p className="font-semibold">
                          {m.user.name ?? m.user.email}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {m.user.email} · angefragt am {formatDate(m.createdAt)}
                        </p>
                      </div>
                      <DecideButtons clubId={club.id} membershipId={m.id} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                Mitglieder ({rest.filter((m) => m.status === "ACTIVE").length}{" "}
                aktiv)
              </h3>
              {rest.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Noch keine Mitglieder.
                </p>
              ) : (
                <ul className="flex flex-col gap-1" data-testid="member-list">
                  {rest.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-medium">
                          {m.user.name ?? m.user.email}
                        </span>{" "}
                        <span className="text-muted-foreground text-xs">
                          {m.user.email}
                          {m.isClubAdmin ? " · Vereins-Admin" : ""}
                          {m.validUntil
                            ? ` · gültig bis ${formatDate(m.validUntil)}`
                            : ""}
                        </span>
                      </span>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-semibold " +
                          (m.status === "ACTIVE"
                            ? "bg-ice text-foreground"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        {STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-card rounded-xl border p-3">
              <ImportForm clubId={club.id} />
            </div>
          </section>
        );
      })}
    </main>
  );
}
