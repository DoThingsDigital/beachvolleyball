"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestReset, type ForgotFormState } from "./actions";

const initialState: ForgotFormState = {};

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, initialState);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Passwort vergessen</CardTitle>
      </CardHeader>
      <CardContent>
        {state.ok ? (
          <p className="text-sm" role="status" data-testid="reset-sent">
            Wenn ein Konto mit dieser Adresse existiert, haben wir dir einen
            Link zum Zurücksetzen geschickt. Der Link ist 60 Minuten gültig.
          </p>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="forgot-email">E-Mail-Adresse</Label>
              <Input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            {state.error ? (
              <p className="text-destructive text-sm" role="alert">
                {state.error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? "…" : "Link anfordern"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
