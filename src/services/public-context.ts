import { createRepositories } from "@/src/db/repositories";
import { findOrganisationBySlug } from "@/src/db/registration";
import type { TenantContext } from "@/src/db/tenant";

// Auflösung des öffentlichen Shop-Kontexts: Mandant über DEFAULT_ORG_SLUG,
// erster aktiver Standort, verkaufbare Saison (PRESALE vor ACTIVE).
// Multi-Venue-Frontend mit Standortwahl ist Stufe 3 (P2).

export type PublicShopContext = {
  ctx: TenantContext;
  venue: NonNullable<
    Awaited<ReturnType<ReturnType<typeof createRepositories>["venues"]["findById"]>>
  >;
  season: Awaited<
    ReturnType<ReturnType<typeof createRepositories>["seasons"]["findManyForVenue"]>
  >[number];
};

export async function getPublicShopContext(): Promise<PublicShopContext | null> {
  const organisation = await findOrganisationBySlug(
    process.env.DEFAULT_ORG_SLUG ?? "dtd",
  );
  if (!organisation) return null;

  const ctx: TenantContext = { organisationId: organisation.id };
  const repos = createRepositories(ctx);
  const venues = await repos.venues.findMany();
  const venue = venues.find((v) => v.active) ?? null;
  if (!venue) return null;

  const seasons = await repos.seasons.findManyForVenue(venue.id);
  const season =
    seasons.find((s) => s.status === "PRESALE") ??
    seasons.find((s) => s.status === "ACTIVE") ??
    null;
  if (!season) return null;

  return { ctx, venue, season };
}
