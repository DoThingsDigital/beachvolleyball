import { cookies } from "next/headers";

import { VENUE_COOKIE } from "@/lib/venue-cookie";
import type { Repositories } from "@/src/db/repositories";

// Aktuell gewählter Standort des Admins (Cookie, Fallback: erster Standort).
export async function getSelectedVenue(repos: Repositories) {
  const venues = await repos.venues.findMany();
  const cookieStore = await cookies();
  const cookieVenueId = cookieStore.get(VENUE_COOKIE)?.value;
  return venues.find((v) => v.id === cookieVenueId) ?? venues[0] ?? null;
}
