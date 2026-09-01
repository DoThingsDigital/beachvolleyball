"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import {
  startSingleBookingCheckout,
  type BookingStartState,
} from "./actions";

const initialState: BookingStartState = {};

export function BookButton({
  courtId,
  date,
  time,
  durationMin,
  termsVersion,
}: {
  courtId: string;
  date: string;
  time: string;
  durationMin: number;
  termsVersion: string;
}) {
  const [state, action, pending] = useActionState(
    startSingleBookingCheckout,
    initialState,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="courtId" value={courtId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />
      <input type="hidden" name="durationMin" value={durationMin} />
      <label htmlFor="booking-terms" className="flex items-start gap-2 text-sm">
        <input
          id="booking-terms"
          name="terms"
          type="checkbox"
          required
          className="mt-0.5 size-4"
        />
        <span>
          Ich akzeptiere die{" "}
          <Link href="/recht/agb" className="underline" target="_blank">
            AGB
          </Link>{" "}
          und habe den{" "}
          <Link href="/recht/widerruf" className="underline" target="_blank">
            Widerrufshinweis
          </Link>{" "}
          zur Kenntnis genommen (Version {termsVersion}).
        </span>
      </label>
      <div>
        <Button type="submit" disabled={pending} data-testid="book-now">
          {pending ? "Wird reserviert …" : "Jetzt buchen"}
        </Button>
      </div>
      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
          {state.errorCode === "BILLING_ADDRESS_REQUIRED" ? (
            <>
              {" "}
              <Link href="/konto" className="underline">
                Zum Konto
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Der Platz wird für kurze Zeit reserviert, danach geht es zur Zahlung.
      </p>
    </form>
  );
}
