"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  changeMyEmail,
  changeMyPassword,
  type SecurityFormState,
} from "./actions";

const initialState: SecurityFormState = {};

function Feedback({ state }: { state: SecurityFormState }) {
  return (
    <>
      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-green-700" role="status">
          {state.ok}
        </p>
      ) : null}
    </>
  );
}

export function SecuritySection({ hasPassword }: { hasPassword: boolean }) {
  const [pwState, pwAction, pwPending] = useActionState(
    changeMyPassword,
    initialState,
  );
  const [emailState, emailAction, emailPending] = useActionState(
    changeMyEmail,
    initialState,
  );

  return (
    <section className="flex flex-col gap-5 border-t pt-4">
      <h2 className="text-lg font-medium">Anmeldung &amp; Sicherheit</h2>

      <form action={pwAction} className="flex flex-col gap-3" data-testid="password-form">
        <h3 className="text-sm font-semibold">
          {hasPassword ? "Passwort ändern" : "Passwort festlegen"}
        </h3>
        {hasPassword ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="sec-current">Aktuelles Passwort</Label>
            <Input
              id="sec-current"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Du meldest dich bisher per Anmeldelink an – hier kannst du
            zusätzlich ein Passwort festlegen.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sec-new">Neues Passwort</Label>
            <Input
              id="sec-new"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sec-new2">Wiederholen</Label>
            <Input
              id="sec-new2"
              name="newPasswordRepeat"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </div>
        </div>
        <div>
          <Button type="submit" size="sm" disabled={pwPending}>
            {pwPending ? "…" : "Passwort speichern"}
          </Button>
        </div>
        <Feedback state={pwState} />
      </form>

      <form action={emailAction} className="flex flex-col gap-3" data-testid="email-form">
        <h3 className="text-sm font-semibold">E-Mail-Adresse ändern</h3>
        <p className="text-muted-foreground text-sm">
          Du bekommst einen Bestätigungslink an die neue Adresse; erst nach
          dem Klick wird gewechselt. Danach meldest du dich mit der neuen
          Adresse an.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sec-email">Neue E-Mail-Adresse</Label>
            <Input
              id="sec-email"
              name="newEmail"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sec-email-pw">Aktuelles Passwort</Label>
            <Input
              id="sec-email-pw"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        </div>
        <div>
          <Button type="submit" size="sm" variant="outline" disabled={emailPending}>
            {emailPending ? "…" : "Bestätigungslink senden"}
          </Button>
        </div>
        <Feedback state={emailState} />
      </form>
    </section>
  );
}
