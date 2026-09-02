"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { submitNewPassword, type ResetFormState } from "./actions";

const initialState: ResetFormState = {};

export function ResetForm({ email, token }: { email: string; token: string }) {
  const [state, action, pending] = useActionState(
    submitNewPassword,
    initialState,
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Neues Passwort festlegen</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="token" value={token} />
          <p className="text-muted-foreground text-sm">Konto: {email}</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-password">Neues Passwort</Label>
            <Input
              id="reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-password2">Passwort wiederholen</Label>
            <Input
              id="reset-password2"
              name="passwordRepeat"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </div>
          {state.error ? (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Passwort speichern"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
