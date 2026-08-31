"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  loginWithPassword,
  requestMagicLink,
  type LoginFormState,
} from "./actions";

const initialState: LoginFormState = {};

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [passwordState, passwordAction, passwordPending] = useActionState(
    loginWithPassword,
    initialState,
  );
  const [magicState, magicAction, magicPending] = useActionState(
    requestMagicLink,
    initialState,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Mit Passwort anmelden</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={passwordAction} className="flex flex-col gap-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-email">E-Mail-Adresse</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-password">Passwort</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {passwordState.error ? (
              <p className="text-destructive text-sm" role="alert">
                {passwordState.error}
              </p>
            ) : null}
            <Button type="submit" disabled={passwordPending}>
              {passwordPending ? "Wird angemeldet …" : "Anmelden"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anmeldelink per E-Mail</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={magicAction} className="flex flex-col gap-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="magic-email">E-Mail-Adresse</Label>
              <Input
                id="magic-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            {magicState.error ? (
              <p className="text-destructive text-sm" role="alert">
                {magicState.error}
              </p>
            ) : null}
            <Button type="submit" variant="outline" disabled={magicPending}>
              {magicPending ? "Wird gesendet …" : "Anmeldelink senden"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
