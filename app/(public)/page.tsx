import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { formatCents, formatWeekday } from "@/lib/format";
import { isoWeekdayOfDate } from "@/src/domain/week-occupancy";
import { getWeekOccupancy } from "@/src/services/occupancy";
import { getPublicShopContext } from "@/src/services/public-context";
import { getSingleBookingQuote } from "@/src/services/single-booking";

// Startseite laut CI (Screen 5a): Hero mit Verlauf, Winter-Badge,
// Glow-Dom, Info-Cards mit „Nächster freier Slot".

// Live-Verfügbarkeit: nie zur Build-Zeit einfrieren (next build würde die
// Seite sonst statisch mit dem Seed-Stand rendern).
export const dynamic = "force-dynamic";

async function findNextFreeSlot() {
  const shop = await getPublicShopContext();
  if (!shop) return null;
  const { ctx, venue } = shop;

  // heute + morgen nach dem ersten freien, buchbaren Slot durchsuchen
  const now = Date.now();
  const todayLocal = new Date(now).toISOString().slice(0, 10);
  try {
    const week = await getWeekOccupancy(ctx, {
      venueId: venue.id,
      startDate: todayLocal,
    });
    for (const day of week.days.slice(0, 7)) {
      for (const slot of day.slots) {
        for (const court of week.courts) {
          if (slot.states[court.id] !== "FREI") continue;
          try {
            const quote = await getSingleBookingQuote(ctx, {
              venueId: venue.id,
              courtId: court.id,
              date: day.date,
              time: slot.time,
              durationMin: venue.minDurationMin,
              isMember: false,
            });
            return {
              date: day.date,
              weekday: isoWeekdayOfDate(day.date),
              time: slot.time,
              courtName: court.name,
              priceFormatted: formatCents(quote.grossCents),
            };
          } catch {
            // Slot nicht buchbar (Vorlauf/Saison) → weitersuchen
          }
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export default async function HomePage() {
  const shop = await getPublicShopContext();
  const nextSlot = shop ? await findNextFreeSlot() : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-8">
      <section className="bg-hero-gradient relative overflow-hidden rounded-2xl px-6 py-12 sm:px-14 sm:py-14">
        <div className="relative z-10 max-w-xl">
          <h1 className="text-background text-4xl leading-[1.04] font-extrabold sm:text-5xl">
            Draußen Winter.
            <br />
            Hier: Sommer.
          </h1>
          <p className="mt-4 text-[#FFE0B8]">
            Beach-Felder, 25 Grad, Sand unter den Füßen — den ganzen Winter in
            Köln.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/kalender"
              className="bg-background text-coral-deep font-display inline-flex h-12 items-center rounded-full px-7 font-bold"
            >
              Jetzt Slot sichern
            </Link>
            <span className="text-ice inline-flex items-center gap-1.5 rounded-full bg-[rgba(14,78,96,0.9)] px-3.5 py-2 text-sm font-semibold">
              ❄ −2° draußen · 25° drinnen
            </span>
          </div>
        </div>
        <span
          aria-hidden
          className="dome-glow dome-glow-shadow absolute -right-10 -bottom-8 h-24 w-64"
        />
      </section>

      <section className="flex flex-col gap-3.5 sm:flex-row">
        <div className="bg-card flex-1 rounded-xl border p-5">
          <h2 className="text-lg font-bold">Feld buchen</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Einzelne Slots im Kalender — du wählst Platz, Zeit und Dauer.
          </p>
          <Link
            href="/kalender"
            className="text-coral-deep mt-2 inline-block text-sm font-bold hover:underline"
          >
            Zum Kalender →
          </Link>
        </div>
        <div className="bg-card flex-1 rounded-xl border p-5">
          <h2 className="text-lg font-bold">Dauerplatz sichern</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Dein fester Wochentermin über die ganze Saison — mit Rabatt.
          </p>
          <Link
            href="/vorverkauf"
            className="text-coral-deep mt-2 inline-block text-sm font-bold hover:underline"
          >
            Zum Vorverkauf →
          </Link>
        </div>
        <div className="bg-sand flex-1 rounded-xl p-5">
          <h2 className="text-sand-dark text-lg font-bold">
            Nächster freier Slot
          </h2>
          {nextSlot ? (
            <>
              <p className="text-sand-dark mt-1 text-sm font-semibold">
                {formatWeekday(nextSlot.weekday)} {nextSlot.time} ·{" "}
                {nextSlot.courtName} · {nextSlot.priceFormatted}
              </p>
              <Link
                href={`/kalender?tag=${nextSlot.date}&zeit=${nextSlot.time}`}
                className="text-coral-deep mt-2 inline-block text-sm font-bold hover:underline"
              >
                Direkt buchen →
              </Link>
            </>
          ) : (
            <p className="text-sand-dark mt-1 text-sm">
              Der Vorverkauf läuft — die Halle öffnet im Oktober.
            </p>
          )}
        </div>
      </section>

      <p className="text-stone flex items-center gap-2 text-xs">
        <Logo small /> · Winter-Beachvolleyball unter der Traglufthalle
      </p>
    </main>
  );
}
