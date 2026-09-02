import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatCents, formatWeekday } from "@/lib/format";
import { auth } from "@/src/auth";
import { createRepositories } from "@/src/db/repositories";
import { findProfile } from "@/src/db/users";
import { getPublicShopContext } from "@/src/services/public-context";

import { findUserWithPassword } from "@/src/db/account";
import { findUpcomingBookingsForUser } from "@/src/db/bookings";
import { findClubsWithMyMembership } from "@/src/db/club-memberships";
import { getCreditBalance } from "@/src/db/credit";
import { formatDateTime } from "@/lib/format";

import { logout } from "@/app/(public)/login/actions";

import { BookingList, type MyBooking } from "./booking-list";
import { MembershipSection, type ClubWithStatus } from "./membership-section";
import { ProfileForm } from "./profile-form";
import { SecuritySection } from "./security-forms";

const SUB_STATUS_LABELS: Record<string, string> = {
  PENDING: "Warten auf Zahlung",
  ACTIVE: "Aktiv",
  CANCELLED: "Storniert",
};

export default async function KontoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/konto");
  }

  const profile = await findProfile(session.user.id);

  const shop = await getPublicShopContext();
  const subscriptions = shop
    ? await createRepositories(shop.ctx).subscriptions.findManyForUser(
        session.user.id,
      )
    : [];

  const clubs: ClubWithStatus[] = shop
    ? (await findClubsWithMyMembership(shop.ctx, session.user.id)).map(
        (club) => ({
          id: club.id,
          name: club.name,
          status:
            (club.clubMemberships[0]?.status as ClubWithStatus["status"]) ??
            "NONE",
          isClubAdmin: club.clubMemberships[0]?.isClubAdmin ?? false,
        }),
      )
    : [];

  const creditBalance = shop
    ? await getCreditBalance(shop.ctx, session.user.id)
    : 0;

  const upcoming: MyBooking[] = shop
    ? (await findUpcomingBookingsForUser(shop.ctx, session.user.id)).map(
        (b) => ({
          id: b.id,
          courtName: b.court.name,
          whenFormatted: formatDateTime(b.startAt),
          status: b.status as MyBooking["status"],
          kind: b.kind as MyBooking["kind"],
          cancellable:
            b.kind === "CUSTOMER" &&
            b.status === "CONFIRMED" &&
            b.startAt.getTime() - Date.now() >=
              b.venue.cancelHours * 60 * 60 * 1000,
          cancelHours: b.venue.cancelHours,
          orderId: b.orderItem?.orderId ?? null,
        }),
      )
    : [];

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mein Konto</h1>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Abmelden
          </Button>
        </form>
      </div>
      <p className="text-sm">
        Angemeldet als{" "}
        <span data-testid="session-email" className="font-medium">
          {session.user.email}
        </span>
        {profile?.termsAcceptedVersion ? (
          <span className="text-muted-foreground">
            {" "}
            · AGB akzeptiert (Version {profile.termsAcceptedVersion})
          </span>
        ) : null}
      </p>
      {creditBalance > 0 ? (
        <p className="text-sm" data-testid="credit-balance">
          Guthaben:{" "}
          <span className="font-semibold">{formatCents(creditBalance)}</span>{" "}
          <span className="text-muted-foreground">
            – wird beim Bezahlen einer Bestellung angeboten, sobald es den
            Gesamtbetrag deckt.
          </span>
        </p>
      ) : null}
      <MembershipSection clubs={clubs} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Meine Buchungen</h2>
        <BookingList bookings={upcoming} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Meine Dauerplätze</h2>
        {subscriptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Noch keine Dauerplätze gebucht.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="my-subscriptions">
            {subscriptions.map((sub) => (
              <li key={sub.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {sub.court.name} · {formatWeekday(sub.weekday)}{" "}
                  {sub.startTime} Uhr ({sub.durationMin} min)
                </p>
                <p className="text-muted-foreground mt-1">
                  {sub.season.name} · {formatCents(sub.totalCents)} ·{" "}
                  {SUB_STATUS_LABELS[sub.status] ?? sub.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProfileForm
        values={{
          name: profile?.name ?? "",
          phone: profile?.phone ?? "",
          billingStreet: profile?.billingStreet ?? "",
          billingZip: profile?.billingZip ?? "",
          billingCity: profile?.billingCity ?? "",
          billingCountry: profile?.billingCountry ?? "",
        }}
      />

      <SecuritySection
        hasPassword={Boolean(
          (await findUserWithPassword(session.user.id))?.passwordHash,
        )}
      />
    </main>
  );
}
