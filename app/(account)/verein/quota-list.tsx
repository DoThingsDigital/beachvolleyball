"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { quotaAction, type ClubAdminActionState } from "./actions";

const initialState: ClubAdminActionState = {};

export type QuotaBooking = {
  id: string;
  whenFormatted: string;
  courtName: string;
  status: "CONFIRMED" | "RELEASED";
  clubConfirmed: boolean;
  label: string;
  /** fest reserviert (keine Auto-Freigabe) → kein Bestätigen nötig */
  fixedReserved: boolean;
};

function QuotaRow({
  clubId,
  booking,
}: {
  clubId: string;
  booking: QuotaBooking;
}) {
  const [state, formAction, pending] = useActionState(
    quotaAction,
    initialState,
  );

  return (
    <li className="bg-card flex flex-col gap-2 rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-semibold">{booking.whenFormatted}</span>{" "}
          <span className="text-muted-foreground">· {booking.courtName}</span>
        </p>
        {booking.status === "RELEASED" ? (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
            Freigegeben
          </span>
        ) : booking.fixedReserved ? (
          <span className="bg-ice text-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
            Fest reserviert
          </span>
        ) : booking.clubConfirmed ? (
          <span className="bg-ice text-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
            Bestätigt
          </span>
        ) : (
          <span className="bg-sun-gold/30 rounded-full px-2 py-0.5 text-xs font-semibold">
            Unbestätigt
          </span>
        )}
      </div>

      {booking.status === "CONFIRMED" ? (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="clubId" value={clubId} />
          <input type="hidden" name="bookingId" value={booking.id} />
          <input
            name="label"
            defaultValue={booking.label}
            placeholder="Trainingsgruppe (optional)"
            className="border-input bg-background h-8 w-44 rounded-md border px-2 text-sm"
          />
          <Button
            type="submit"
            name="action"
            value="LABEL"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            Beschriften
          </Button>
          {!booking.clubConfirmed && !booking.fixedReserved ? (
            <Button
              type="submit"
              name="action"
              value="CONFIRM"
              size="sm"
              disabled={pending}
            >
              Bestätigen
            </Button>
          ) : null}
          <Button
            type="submit"
            name="action"
            value="RELEASE"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            Freigeben
          </Button>
          {state.error ? (
            <span className="text-destructive text-xs" role="alert">
              {state.error}
            </span>
          ) : null}
          {state.ok ? (
            <span className="text-xs text-green-700" role="status">
              {state.ok}
            </span>
          ) : null}
        </form>
      ) : booking.label ? (
        <p className="text-muted-foreground text-xs">{booking.label}</p>
      ) : null}
    </li>
  );
}

export function QuotaList({
  clubId,
  bookings,
  releaseHours,
}: {
  clubId: string;
  bookings: QuotaBooking[];
  releaseHours: number;
}) {
  if (bookings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Keine kommenden Kontingent-Termine.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        Unbestätigte Termine werden {releaseHours} Stunden vor Beginn
        automatisch freigegeben und sind dann kommerziell buchbar. Bestätigte
        Termine bleiben beim Verein.
      </p>
      <ul className="flex flex-col gap-2" data-testid="quota-list">
        {bookings.map((b) => (
          <QuotaRow key={b.id} clubId={clubId} booking={b} />
        ))}
      </ul>
    </div>
  );
}
