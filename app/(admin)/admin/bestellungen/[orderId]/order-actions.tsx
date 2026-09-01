"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  adminRefundOrder,
  adminResendInvoice,
  type AdminOrderActionState,
} from "./actions";

const initialState: AdminOrderActionState = {};

export function RefundForm({
  orderId,
  remainingFormatted,
  disabled,
}: {
  orderId: string;
  remainingFormatted: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    adminRefundOrder,
    initialState,
  );

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border p-3">
      <h2 className="text-lg font-medium">Erstattung</h2>
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="refund-amount">
            Betrag in € (leer = Rest: {remainingFormatted})
          </Label>
          <Input id="refund-amount" name="amount" className="w-40" placeholder="z. B. 12,50" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="refund-reason">Grund</Label>
          <Input id="refund-reason" name="reason" required minLength={3} />
        </div>
        <Button type="submit" disabled={pending || disabled} variant="destructive">
          {pending ? "Wird erstattet …" : "Erstatten"}
        </Button>
      </div>
      {disabled ? (
        <p className="text-muted-foreground text-xs">
          Erstattung nur bei bezahlten Bestellungen möglich.
        </p>
      ) : null}
      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}

export function ResendInvoiceButton({
  orderId,
  invoiceId,
}: {
  orderId: string;
  invoiceId: string;
}) {
  const [state, action, pending] = useActionState(
    adminResendInvoice,
    initialState,
  );

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Erneut senden"}
      </Button>
      {state.error ? (
        <span className="text-destructive text-xs" role="alert">
          {state.error}
        </span>
      ) : null}
      {state.ok ? (
        <span className="text-xs text-green-700 dark:text-green-400" role="status">
          {state.ok}
        </span>
      ) : null}
    </form>
  );
}
