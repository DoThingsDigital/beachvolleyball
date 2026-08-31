"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";
import { VENUE_COOKIE } from "@/lib/venue-cookie";

const switchVenueSchema = z.object({ venueId: z.string().min(1) });

export async function switchVenue(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = switchVenueSchema.safeParse({
    venueId: formData.get("venueId"),
  });
  if (!parsed.success) return;

  // Nur Venues des eigenen Mandanten sind wählbar.
  const repos = createRepositories(staff.ctx);
  const venue = await repos.venues.findById(parsed.data.venueId);
  if (!venue) return;

  const cookieStore = await cookies();
  cookieStore.set(VENUE_COOKIE, venue.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
  });
  revalidatePath("/admin");
}
