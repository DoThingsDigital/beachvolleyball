"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { register, type RegisterFormState } from "./actions";

const initialState: RegisterFormState = {};

export function RegisterForm({ termsVersion }: { termsVersion: string }) {
  const [state, action, pending] = useActionState(register, initialState);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Konto erstellen</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reg-email">E-Mail-Adresse</Label>
            <Input id="reg-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reg-name">Name</Label>
            <Input id="reg-name" name="name" autoComplete="name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reg-phone">Telefon (optional)</Label>
            <Input id="reg-phone" name="phone" type="tel" autoComplete="tel" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reg-password">Passwort (mind. 10 Zeichen)</Label>
            <Input
              id="reg-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </div>
          <label htmlFor="reg-terms" className="flex items-start gap-2 text-sm">
            <input id="reg-terms" name="terms" type="checkbox" className="mt-0.5 size-4" />
            <span>
              Ich stimme den <Link href="/agb" className="underline">AGB</Link>{" "}
              und der Datenschutzerklärung zu (Version {termsVersion}).
            </span>
          </label>
          {state.error ? (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Wird erstellt …" : "Registrieren"}
          </Button>
          <p className="text-muted-foreground text-xs">
            Schon ein Konto?{" "}
            <Link href="/login" className="underline">
              Zur Anmeldung
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
