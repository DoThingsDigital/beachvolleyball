"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  adminCancelSubscription,
  saveCustomerNotes,
  type CustomerActionState,
} from "../actions";

const initialState: CustomerActionState = {};

function Feedback({ state }: { state: CustomerActionState }) {
  if (state.error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="text-sm text-green-700 dark:text-green-400" role="status">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function NotesForm({
  userId,
  notes,
}: {
  userId: string;
  notes: string;
}) {
  const [state, action, pending] = useActionState(
    saveCustomerNotes,
    initialState,
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Label htmlFor="customer-notes">Interne Notizen</Label>
      <textarea
        id="customer-notes"
        name="notes"
        defaultValue={notes}
        rows={4}
        className="border-input bg-background rounded-md border p-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : "Notiz speichern"}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function CancelSubscriptionForm({
  userId,
  subscriptionId,
}: {
  userId: string;
  subscriptionId: string;
}) {
  const [state, action, pending] = useActionState(
    adminCancelSubscription,
    initialState,
  );
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor={`cancel-reason-${subscriptionId}`}>Kündigungsgrund</Label>
        <Input
          id={`cancel-reason-${subscriptionId}`}
          name="reason"
          required
          minLength={3}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`cancel-refund-${subscriptionId}`}>Erstattung</Label>
        <select
          id={`cancel-refund-${subscriptionId}`}
          name="withRefund"
          defaultValue="ja"
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="ja">Anteilig erstatten</option>
          <option value="nein">Ohne Erstattung</option>
        </select>
      </div>
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "…" : "Kündigen"}
      </Button>
      <div className="w-full">
        <Feedback state={state} />
      </div>
    </form>
  );
}
