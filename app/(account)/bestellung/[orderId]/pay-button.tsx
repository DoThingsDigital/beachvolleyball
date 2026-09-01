"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";

import { payOrder, payWithCredit, type PayState } from "./actions";

const initialState: PayState = {};

export function PayButton({
  orderId,
  creditBalanceCents = 0,
  totalCents = 0,
}: {
  orderId: string;
  /** verfügbares Guthaben (M1); Button erscheint nur bei voller Deckung */
  creditBalanceCents?: number;
  totalCents?: number;
}) {
  const [state, action, pending] = useActionState(payOrder, initialState);
  const [creditState, creditAction, creditPending] = useActionState(
    payWithCredit,
    initialState,
  );
  const creditCovers =
    creditBalanceCents > 0 && creditBalanceCents >= totalCents;

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} data-testid="pay-button">
          {pending ? "Weiterleitung zu Stripe …" : "Jetzt bezahlen"}
        </Button>
        {creditCovers ? (
          <Button
            type="submit"
            variant="outline"
            formAction={creditAction}
            disabled={creditPending}
            data-testid="pay-credit-button"
          >
            {creditPending
              ? "Wird verrechnet …"
              : `Mit Guthaben zahlen (${formatCents(creditBalanceCents)} verfügbar)`}
          </Button>
        ) : null}
      </div>
      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      {creditState.error ? (
        <p className="text-destructive text-sm" role="alert">
          {creditState.error}
        </p>
      ) : null}
      {creditBalanceCents > 0 && !creditCovers ? (
        <p className="text-muted-foreground text-xs">
          Guthaben {formatCents(creditBalanceCents)} vorhanden – es deckt diese
          Bestellung nicht vollständig und kann daher (noch) nicht verrechnet
          werden.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Sichere Zahlung über Stripe – SEPA-Lastschrift oder Karte.
      </p>
    </form>
  );
}
