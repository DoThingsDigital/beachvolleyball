"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  appointClubAdmin,
  revokeClubAdminAction,
  type ClubAdminAppointState,
} from "./actions";

const initialState: ClubAdminAppointState = {};

export type ClubAdminEntry = {
  membershipId: string;
  name: string | null;
  email: string;
};

function Feedback({ state }: { state: ClubAdminAppointState }) {
  return (
    <>
      {state.error ? (
        <span className="text-destructive text-xs" role="alert">
          {state.error}
        </span>
      ) : null}
      {state.ok ? (
        <span className="text-xs text-green-700" role="status">
          {state.ok}
        </span>
      ) : null}
    </>
  );
}

export function ClubAdmins({
  clubId,
  admins,
}: {
  clubId: string;
  admins: ClubAdminEntry[];
}) {
  const [appointState, appointAction, appointPending] = useActionState(
    appointClubAdmin,
    initialState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeClubAdminAction,
    initialState,
  );

  return (
    <div className="flex flex-col gap-2" data-testid={`club-admins-${clubId}`}>
      <p className="text-sm font-medium">Vereins-Admins</p>
      {admins.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Noch niemand ernannt – der Verein kann Anfragen und Kontingent erst
          verwalten, wenn es einen Vereins-Admin gibt.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {admins.map((admin) => (
            <li
              key={admin.membershipId}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm"
            >
              <span>
                <span className="font-medium">{admin.name ?? admin.email}</span>{" "}
                <span className="text-muted-foreground text-xs">
                  {admin.email}
                </span>
              </span>
              <form action={revokeAction}>
                <input type="hidden" name="clubId" value={clubId} />
                <input
                  type="hidden"
                  name="membershipId"
                  value={admin.membershipId}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={revokePending}
                >
                  Entziehen
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={appointAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="clubId" value={clubId} />
        <Input
          name="email"
          type="email"
          required
          placeholder="vorstand@verein.de"
          className="h-9 w-64"
        />
        <Button type="submit" size="sm" disabled={appointPending}>
          {appointPending ? "…" : "Zum Vereins-Admin ernennen"}
        </Button>
        <Feedback state={appointState} />
        <Feedback state={revokeState} />
      </form>
    </div>
  );
}
