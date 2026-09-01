"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  cancelSubscriptionAction,
  type SubscriptionAdminActionState,
} from "./actions";

const initialState: SubscriptionAdminActionState = {};

export function CancelSubscriptionForm({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    cancelSubscriptionAction,
    initialState,
  );

  if (!open && !state.ok) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        Kündigen …
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <Input
        name="reason"
        required
        placeholder="Grund (z. B. Kundenwunsch)"
        className="h-8 w-52 text-sm"
      />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          name="withRefund"
          defaultChecked
          className="size-4"
        />
        anteilig erstatten
      </label>
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "…" : "Kündigen"}
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
  );
}
