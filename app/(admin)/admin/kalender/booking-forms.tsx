"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  cancelBookingAction,
  createManualBookingAction,
  moveBookingAction,
  noShowAction,
  type CalendarActionState,
} from "./actions";

const initialState: CalendarActionState = {};

function Feedback({ state }: { state: CalendarActionState }) {
  return (
    <>
      {state.error ? (
        <span className="text-destructive text-sm" role="alert">
          {state.error}
        </span>
      ) : null}
      {state.ok ? (
        <span className="text-sm text-green-700" role="status">
          {state.ok}
        </span>
      ) : null}
    </>
  );
}

const USAGE_OPTIONS = [
  { value: "INTERN", label: "Intern" },
  { value: "KOMMERZIELL", label: "Kommerziell" },
  { value: "VEREIN", label: "Verein" },
  { value: "LIGA", label: "Liga" },
] as const;

export function ManualBookingForm({
  venueId,
  courts,
  date,
  time,
  courtId,
  durations,
}: {
  venueId: string;
  courts: { id: string; name: string }[];
  date: string;
  time: string;
  courtId: string;
  durations: number[];
}) {
  const [state, formAction, pending] = useActionState(
    createManualBookingAction,
    initialState,
  );
  const [mode, setMode] = useState<"FREE" | "INVOICE">("FREE");
  const [pricing, setPricing] = useState<"RULES" | "MANUAL">("RULES");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      data-testid="manual-booking-form"
    >
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="mode" value={mode} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="mb-court">Platz</Label>
          <select
            id="mb-court"
            name="courtId"
            defaultValue={courtId}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mb-date">Datum</Label>
          <Input id="mb-date" name="date" type="date" defaultValue={date} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mb-time">Beginn</Label>
          <Input id="mb-time" name="time" type="time" defaultValue={time} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mb-duration">Dauer</Label>
          <select
            id="mb-duration"
            name="durationMin"
            defaultValue={durations[0]}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {d % 60 === 0 ? `${d / 60} Std.` : `${d} min`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2" role="radiogroup" aria-label="Art der Belegung">
        <button
          type="button"
          onClick={() => setMode("FREE")}
          aria-pressed={mode === "FREE"}
          className={
            "rounded-full border px-3.5 py-1.5 text-sm font-semibold " +
            (mode === "FREE" ? "bg-primary text-primary-foreground border-primary" : "bg-card")
          }
        >
          Ohne Rechnung
        </button>
        <button
          type="button"
          onClick={() => setMode("INVOICE")}
          aria-pressed={mode === "INVOICE"}
          className={
            "rounded-full border px-3.5 py-1.5 text-sm font-semibold " +
            (mode === "INVOICE" ? "bg-primary text-primary-foreground border-primary" : "bg-card")
          }
        >
          Mit Rechnung
        </button>
      </div>

      {mode === "FREE" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="mb-usage">Nutzungsart</Label>
            <select
              id="mb-usage"
              name="usageType"
              defaultValue="INTERN"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              {USAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mb-label">Beschriftung</Label>
            <Input
              id="mb-label"
              name="label"
              placeholder="z. B. Training, Event …"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mb-email-free">Kunde (E-Mail, optional)</Label>
            <Input id="mb-email-free" name="customerEmail" type="email" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="mb-email">Kunde (E-Mail)</Label>
            <Input id="mb-email" name="customerEmail" type="email" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mb-pricing">Preis</Label>
            <select
              id="mb-pricing"
              name="pricing"
              value={pricing}
              onChange={(e) => setPricing(e.target.value as "RULES" | "MANUAL")}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="RULES">Nach Preisregeln</option>
              <option value="MANUAL">Manueller Betrag</option>
            </select>
          </div>
          {pricing === "MANUAL" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="mb-gross">Betrag (brutto, €)</Label>
              <Input
                id="mb-gross"
                name="manualGross"
                inputMode="decimal"
                placeholder="34,00"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="mb-payment">Zahlart</Label>
            <select
              id="mb-payment"
              name="paymentMethod"
              defaultValue="cash"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="cash">Bar</option>
              <option value="transfer">Überweisung</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : "Belegung anlegen"}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function BookingActionPanel({
  bookingId,
  status,
  courts,
  currentCourtId,
  date,
  time,
}: {
  bookingId: string;
  status: string;
  courts: { id: string; name: string }[];
  currentCourtId: string;
  date: string;
  time: string;
}) {
  const [moveState, moveFormAction, movePending] = useActionState(
    moveBookingAction,
    initialState,
  );
  const [cancelState, cancelFormAction, cancelPending] = useActionState(
    cancelBookingAction,
    initialState,
  );
  const [noShowState, noShowFormAction, noShowPending] = useActionState(
    noShowAction,
    initialState,
  );

  const active =
    status === "HOLD" || status === "PENDING_PAYMENT" || status === "CONFIRMED";

  return (
    <div className="flex flex-col gap-3">
      {active ? (
        <form
          action={moveFormAction}
          className="flex flex-wrap items-end gap-2"
          data-testid="move-form"
        >
          <input type="hidden" name="bookingId" value={bookingId} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="mv-court">Platz</Label>
            <select
              id="mv-court"
              name="courtId"
              defaultValue={currentCourtId}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mv-date">Datum</Label>
            <Input id="mv-date" name="date" type="date" defaultValue={date} className="w-36" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mv-time">Beginn</Label>
            <Input id="mv-time" name="time" type="time" defaultValue={time} className="w-28" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={movePending}>
            {movePending ? "…" : "Verschieben"}
          </Button>
          <Feedback state={moveState} />
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {active ? (
          <form action={cancelFormAction}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={cancelPending}
            >
              {cancelPending ? "…" : "Stornieren"}
            </Button>
          </form>
        ) : null}
        {status === "CONFIRMED" ? (
          <form action={noShowFormAction}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <Button type="submit" size="sm" variant="outline" disabled={noShowPending}>
              {noShowPending ? "…" : "No-Show"}
            </Button>
          </form>
        ) : null}
        <Feedback state={cancelState} />
        <Feedback state={noShowState} />
      </div>
    </div>
  );
}
