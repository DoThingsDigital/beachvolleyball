"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { requestMembership, type MembershipRequestState } from "./actions";

const initialState: MembershipRequestState = {};

export type ClubWithStatus = {
  id: string;
  name: string;
  status: "NONE" | "PENDING" | "ACTIVE" | "EXPIRED" | "REJECTED";
  isClubAdmin: boolean;
};

const STATUS_LABELS: Record<ClubWithStatus["status"], string> = {
  NONE: "",
  PENDING: "Angefragt – wartet auf Freigabe",
  ACTIVE: "Aktives Mitglied – Mitgliederpreise aktiv",
  EXPIRED: "Abgelaufen",
  REJECTED: "Abgelehnt",
};

function RequestForm({ clubId }: { clubId: string }) {
  const [state, action, pending] = useActionState(
    requestMembership,
    initialState,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="clubId" value={clubId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Mitgliedschaft anfragen"}
      </Button>
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

export function MembershipSection({ clubs }: { clubs: ClubWithStatus[] }) {
  if (clubs.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">Vereinsmitgliedschaft</h2>
      <ul className="flex flex-col gap-2">
        {clubs.map((club) => (
          <li
            key={club.id}
            className="bg-card flex items-start justify-between gap-3 rounded-xl border p-3 text-sm"
          >
            <div>
              <p className="font-semibold">{club.name}</p>
              {club.status !== "NONE" ? (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {STATUS_LABELS[club.status]}
                </p>
              ) : (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Als verifiziertes Mitglied buchst du zum Mitgliederpreis.
                </p>
              )}
              {club.isClubAdmin ? (
                <Link
                  href="/verein"
                  className="text-coral-deep mt-1 inline-block text-xs font-bold hover:underline"
                >
                  Zur Vereinsverwaltung →
                </Link>
              ) : null}
            </div>
            {club.status === "NONE" ||
            club.status === "REJECTED" ||
            club.status === "EXPIRED" ? (
              <RequestForm clubId={club.id} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
