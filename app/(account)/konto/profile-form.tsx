"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveProfile, type ProfileFormState } from "./actions";

const initialState: ProfileFormState = {};

export type ProfileValues = {
  name: string;
  phone: string;
  billingStreet: string;
  billingZip: string;
  billingCity: string;
  billingCountry: string;
};

export function ProfileForm({ values }: { values: ProfileValues }) {
  const [state, action, pending] = useActionState(saveProfile, initialState);

  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" name="name" defaultValue={values.name} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-phone">Telefon</Label>
        <Input id="profile-phone" name="phone" type="tel" defaultValue={values.phone} />
      </div>

      <h2 className="mt-2 text-lg font-medium">Rechnungsadresse</h2>
      <p className="text-muted-foreground text-xs">
        Wird für Rechnungen benötigt und ist vor dem ersten Kauf Pflicht.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-street">Straße und Hausnummer</Label>
        <Input id="profile-street" name="billingStreet" defaultValue={values.billingStreet} />
      </div>
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="profile-zip">PLZ</Label>
          <Input id="profile-zip" name="billingZip" defaultValue={values.billingZip} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profile-city">Ort</Label>
          <Input id="profile-city" name="billingCity" defaultValue={values.billingCity} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-country">Land (z. B. DE)</Label>
        <Input
          id="profile-country"
          name="billingCountry"
          defaultValue={values.billingCountry}
          maxLength={2}
          className="w-24"
        />
      </div>

      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          Gespeichert.
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Wird gespeichert …" : "Profil speichern"}
        </Button>
      </div>
    </form>
  );
}
