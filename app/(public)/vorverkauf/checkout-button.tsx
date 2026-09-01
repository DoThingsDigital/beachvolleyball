"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import {
  startSubscriptionCheckout,
  type CheckoutStartState,
} from "./actions";

const initialState: CheckoutStartState = {};

export function CheckoutButton({
  courtId,
  weekday,
  startTime,
  durationMin,
}: {
  courtId: string;
  weekday: number;
  startTime: string;
  durationMin: number;
}) {
  const [state, action, pending] = useActionState(
    startSubscriptionCheckout,
    initialState,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="courtId" value={courtId} />
      <input type="hidden" name="weekday" value={weekday} />
      <input type="hidden" name="startTime" value={startTime} />
      <input type="hidden" name="durationMin" value={durationMin} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Wird reserviert …" : "Weiter zum Checkout"}
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
        Die Termine werden 15 Minuten für dich reserviert.
      </p>
    </form>
  );
}
