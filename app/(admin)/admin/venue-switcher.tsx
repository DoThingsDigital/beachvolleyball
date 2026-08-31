"use client";

import { useRef } from "react";

import { switchVenue } from "./actions";

type VenueOption = { id: string; name: string };

export function VenueSwitcher({
  venues,
  selectedVenueId,
}: {
  venues: VenueOption[];
  selectedVenueId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (venues.length <= 1) {
    return (
      <span className="text-sm font-medium" data-testid="venue-name">
        {venues[0]?.name ?? "Kein Standort"}
      </span>
    );
  }

  return (
    <form ref={formRef} action={switchVenue}>
      <label className="sr-only" htmlFor="venue-switcher">
        Standort wechseln
      </label>
      <select
        id="venue-switcher"
        name="venueId"
        defaultValue={selectedVenueId}
        onChange={() => formRef.current?.requestSubmit()}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
      >
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </form>
  );
}
