"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import {
  decideMembership,
  importMembers,
  type ClubAdminActionState,
} from "./actions";

const initialState: ClubAdminActionState = {};

export function DecideButtons({
  clubId,
  membershipId,
}: {
  clubId: string;
  membershipId: string;
}) {
  const [state, action, pending] = useActionState(
    decideMembership,
    initialState,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <div className="flex gap-2">
        <Button
          type="submit"
          name="decision"
          value="ACTIVE"
          size="sm"
          disabled={pending}
        >
          Freigeben
        </Button>
        <Button
          type="submit"
          name="decision"
          value="REJECTED"
          size="sm"
          variant="outline"
          disabled={pending}
        >
          Ablehnen
        </Button>
      </div>
      {state.error ? (
        <p className="text-destructive text-xs" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function ImportForm({ clubId }: { clubId: string }) {
  const [state, action, pending] = useActionState(importMembers, initialState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="clubId" value={clubId} />
      <label className="text-sm font-medium" htmlFor={`import-${clubId}`}>
        Mitgliederliste importieren
      </label>
      <p className="text-muted-foreground text-xs">
        E-Mail-Adressen einfügen (eine pro Zeile oder mit Komma/Semikolon
        getrennt, z.&nbsp;B. aus einer CSV-Spalte). Bekannte Konten werden
        sofort als Mitglied aktiviert.
      </p>
      <textarea
        id={`import-${clubId}`}
        name="emails"
        rows={4}
        required
        placeholder={"anna@example.com\nben@example.com"}
        className="border-input bg-card w-full rounded-xl border p-2.5 text-sm"
      />
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Importiere …" : "Importieren"}
        </Button>
      </div>
      {state.error ? (
        <p className="text-destructive text-xs" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-xs text-green-700" role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
