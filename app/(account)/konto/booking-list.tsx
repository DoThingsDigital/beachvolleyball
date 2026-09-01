"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { cancelMyBooking, type CancelBookingState } from "./actions";

const initialState: CancelBookingState = {};

export type MyBooking = {
  id: string;
  courtName: string;
  whenFormatted: string;
  status: "HOLD" | "PENDING_PAYMENT" | "CONFIRMED";
  kind: "CUSTOMER" | "SUBSCRIPTION" | "BLOCK";
  cancellable: boolean;
  cancelHours: number;
  orderId: string | null;
};

function CancelForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(cancelMyBooking, initialState);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Stornieren"}
      </Button>
      {state.error ? (
        <p className="text-destructive text-xs" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-xs text-green-700 dark:text-green-400" role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}

export function BookingList({ bookings }: { bookings: MyBooking[] }) {
  if (bookings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Keine anstehenden Buchungen.{" "}
        <Link href="/kalender" className="underline">
          Jetzt Platz buchen
        </Link>
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="my-bookings">
      {bookings.map((booking) => (
        <li
          key={booking.id}
          className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
        >
          <div>
            <p className="font-medium">
              {booking.courtName} · {booking.whenFormatted}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {booking.kind === "SUBSCRIPTION" ? "Dauerplatz-Termin · " : ""}
              {booking.status === "CONFIRMED"
                ? `Bestätigt · kostenlos stornierbar bis ${booking.cancelHours} Std. vorher`
                : "Zahlung ausstehend"}
              {booking.status !== "CONFIRMED" && booking.orderId ? (
                <>
                  {" · "}
                  <Link href={`/bestellung/${booking.orderId}`} className="underline">
                    Zur Bestellung
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          {booking.cancellable ? <CancelForm bookingId={booking.id} /> : null}
        </li>
      ))}
    </ul>
  );
}
