"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { payOrder, type PayState } from "./actions";

const initialState: PayState = {};

export function PayButton({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(payOrder, initialState);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div>
        <Button type="submit" disabled={pending} data-testid="pay-button">
          {pending ? "Weiterleitung zu Stripe …" : "Jetzt bezahlen"}
        </Button>
      </div>
      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Sichere Zahlung über Stripe – SEPA-Lastschrift oder Karte.
      </p>
    </form>
  );
}
