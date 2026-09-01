import { TZDate } from "@date-fns/tz";

import { formatCents } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";
import {
  buildAuslastungReport,
  buildDauerplatzQuote,
  buildUmsatzReport,
  buildVereinsnutzungReport,
  formatHours,
  formatQuote,
  type OccupancyGroupBy,
} from "@/src/services/reports";

import { getSelectedVenue } from "../_lib/selected-venue";

// Reports (Tickets 6.1–6.4): Auslastung, Umsatz, Vereinsnutzung (L3),
// Dauerplatz-Quote – mit CSV/PDF-Downloads.

const GROUP_OPTIONS: { value: OccupancyGroupBy; label: string }[] = [
  { value: "day", label: "Tag" },
  { value: "weekday", label: "Wochentag" },
  { value: "court", label: "Platz" },
  { value: "hour", label: "Startstunde" },
];

const PRODUCT_LABELS: Record<string, string> = {
  SINGLE_BOOKING: "Einzelbuchung",
  SUBSCRIPTION: "Dauerplatz",
  MANUAL: "Manuell",
};

const METHOD_LABELS: Record<string, string> = {
  card: "Karte",
  sepa_debit: "SEPA-Lastschrift",
  cash: "Bar",
  transfer: "Überweisung",
};

function monthBounds(timezone: string): { from: string; to: string } {
  const now = new TZDate(Date.now(), timezone);
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, "0");
  return {
    from: `${y}-${mm}-01`,
    to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ von?: string; bis?: string; gruppierung?: string }>;
}) {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  if (!venue) {
    return <p className="text-muted-foreground text-sm">Kein Standort angelegt.</p>;
  }

  const params = await searchParams;
  const defaults = monthBounds(venue.timezone);
  const von = /^\d{4}-\d{2}-\d{2}$/.test(params.von ?? "")
    ? params.von!
    : defaults.from;
  const bis = /^\d{4}-\d{2}-\d{2}$/.test(params.bis ?? "")
    ? params.bis!
    : defaults.to;
  const groupBy = GROUP_OPTIONS.some((g) => g.value === params.gruppierung)
    ? (params.gruppierung as OccupancyGroupBy)
    : "day";

  const [vereinsnutzung, auslastung, umsatz, dauerplatz] = await Promise.all([
    buildVereinsnutzungReport(staff.ctx, { venueId: venue.id, dateFrom: von, dateTo: bis }),
    buildAuslastungReport(staff.ctx, { venueId: venue.id, dateFrom: von, dateTo: bis, groupBy }),
    buildUmsatzReport(staff.ctx, { venueId: venue.id, dateFrom: von, dateTo: bis }),
    buildDauerplatzQuote(staff.ctx, { venueId: venue.id, dateFrom: von, dateTo: bis }),
  ]);

  const download = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ venue: venue.id, von, bis, ...extra });
    return `/admin/reports/download?${q.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Reports – {venue.name}</h1>

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="rp-von" className="font-medium">
            Von
          </label>
          <input
            id="rp-von"
            name="von"
            type="date"
            defaultValue={von}
            className="border-input bg-background h-9 rounded-md border px-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="rp-bis" className="font-medium">
            Bis
          </label>
          <input
            id="rp-bis"
            name="bis"
            type="date"
            defaultValue={bis}
            className="border-input bg-background h-9 rounded-md border px-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="rp-group" className="font-medium">
            Auslastung gruppieren nach
          </label>
          <select
            id="rp-group"
            name="gruppierung"
            defaultValue={groupBy}
            className="border-input bg-background h-9 rounded-md border px-2"
          >
            {GROUP_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-9 rounded-full px-4 text-sm font-semibold"
        >
          Anzeigen
        </button>
      </form>

      {/* L3 Vereinsnutzung */}
      <section className="flex flex-col gap-2 rounded-md border p-4" data-testid="report-vereinsnutzung">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Vereinsnutzung (Sportamt)</h2>
          <span className="flex gap-3 text-sm">
            <a href={download({ report: "vereinsnutzung" })} className="text-coral-deep font-bold hover:underline">
              CSV ↓
            </a>
            <a
              href={download({ report: "vereinsnutzung", format: "pdf" })}
              className="text-coral-deep font-bold hover:underline"
            >
              PDF ↓
            </a>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Vorhaltung / verfügbar", value: vereinsnutzung.quotas.vorhaltungVsVerfuegbar },
            { label: "Vorhaltung / belegt", value: vereinsnutzung.quotas.vorhaltungVsBelegt },
            { label: "Auslastung / verfügbar", value: vereinsnutzung.quotas.auslastungVsVerfuegbar },
            { label: "Auslastung / belegt", value: vereinsnutzung.quotas.auslastungVsBelegt },
          ].map((q) => (
            <div key={q.label} className="bg-card rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">{q.label}</p>
              <p className="font-display text-xl font-bold">{formatQuote(q.value)}</p>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Vorhaltung {formatHours(vereinsnutzung.totals.vereinVorhaltung)} h ·
          Auslastung {formatHours(vereinsnutzung.totals.vereinAuslastung)} h ·
          belegt gesamt {formatHours(vereinsnutzung.totals.belegtGesamt)} h ·
          verfügbar {formatHours(vereinsnutzung.availableHours)} h. Definitionen
          stehen im Export.
        </p>
      </section>

      {/* L1 Auslastung */}
      <section className="flex flex-col gap-2 rounded-md border p-4" data-testid="report-auslastung">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Auslastung</h2>
          <a
            href={download({ report: "auslastung", gruppierung: groupBy })}
            className="text-coral-deep text-sm font-bold hover:underline"
          >
            CSV ↓
          </a>
        </div>
        <p className="text-sm">
          Gesamt: <strong>{formatHours(auslastung.totalHours)}</strong> von{" "}
          {formatHours(auslastung.totalAvailable)} Feldstunden (
          {formatQuote(
            auslastung.totalAvailable > 0
              ? auslastung.totalHours / auslastung.totalAvailable
              : NaN,
          )}
          )
        </p>
        {auslastung.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 border-collapse text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-1 font-normal">
                    {GROUP_OPTIONS.find((g) => g.value === groupBy)?.label}
                  </th>
                  <th className="py-1 text-right font-normal">Feldstunden</th>
                  <th className="py-1 text-right font-normal">Auslastung</th>
                </tr>
              </thead>
              <tbody>
                {auslastung.rows.map((r) => (
                  <tr key={r.key} className="border-b">
                    <td className="py-1">{r.key}</td>
                    <td className="py-1 text-right">{formatHours(r.hours)}</td>
                    <td className="py-1 text-right">
                      {r.quote !== null ? formatQuote(r.quote) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Keine Belegungen im Zeitraum.</p>
        )}
      </section>

      {/* L2 Umsatz */}
      <section className="flex flex-col gap-2 rounded-md border p-4" data-testid="report-umsatz">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Umsatz</h2>
          <a
            href={download({ report: "umsatz" })}
            className="text-coral-deep text-sm font-bold hover:underline"
          >
            CSV ↓
          </a>
        </div>
        <p className="text-sm">
          Brutto <strong>{formatCents(umsatz.totals.grossCents)}</strong> · Netto{" "}
          {formatCents(umsatz.totals.netCents)} · Steuer{" "}
          {formatCents(umsatz.totals.taxCents)} · Erstattungen{" "}
          {formatCents(umsatz.refunds.amountCents)} ({umsatz.refunds.count})
        </p>
        {umsatz.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 border-collapse text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-1 font-normal">Produktart</th>
                  <th className="py-1 font-normal">Zahlart</th>
                  <th className="py-1 text-right font-normal">Bestellungen</th>
                  <th className="py-1 text-right font-normal">Brutto</th>
                </tr>
              </thead>
              <tbody>
                {umsatz.rows.map((r) => (
                  <tr key={`${r.productType}-${r.paymentMethod}`} className="border-b">
                    <td className="py-1">{PRODUCT_LABELS[r.productType] ?? r.productType}</td>
                    <td className="py-1">{METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</td>
                    <td className="py-1 text-right">{r.orderCount}</td>
                    <td className="py-1 text-right">{formatCents(r.grossCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Keine Zahlungseingänge im Zeitraum.</p>
        )}
        <p className="text-muted-foreground text-xs">
          Basis: Zahlungseingang (paidAt) im Zeitraum – damit gegen
          Stripe-Auszahlungen abgleichbar. Erstattungen separat.
        </p>
      </section>

      {/* L4 Dauerplatz-Quote */}
      <section className="flex flex-col gap-2 rounded-md border p-4" data-testid="report-dauerplatz">
        <h2 className="text-lg font-bold">Dauerplatz-Quote</h2>
        <p className="text-sm">
          <strong>{formatQuote(dauerplatz.quote)}</strong> der kundenbelegten
          Feldstunden sind Dauerplätze (
          {formatHours(dauerplatz.subscriptionHours)} h Dauerplatz vs.{" "}
          {formatHours(dauerplatz.customerHours)} h Einzelbuchung).
        </p>
        <p className="text-muted-foreground text-xs">
          Steuerungsgröße für Vorverkauf vs. Einzelbuchung (L4).
        </p>
      </section>

      <p className="text-muted-foreground text-xs">
        Zeitraum {von} bis {bis} (lokale Kalendertage). Eine Belegung zählt zum
        Tag ihres Beginns.
      </p>
    </div>
  );
}

export const dynamic = "force-dynamic";
