"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { checkRateLimit } from "@/lib/rate-limit";
import { auth } from "@/src/auth";
import {
  findClubAdmins,
  findClubBasics,
  requestClubMembership,
} from "@/src/db/club-memberships";
import { updateProfile } from "@/src/db/users";
import { DomainError } from "@/src/domain/errors";
import { changePassword, requestEmailChange } from "@/src/services/account";
import { getBrandName, sendEmail } from "@/src/email/send";
import {
  CLUB_REQUEST_TEMPLATE,
  CLUB_REQUEST_VERSION,
  ClubRequestMail,
} from "@/src/email/templates/club-request-mail.v1";
import { cancelBookingByCustomer } from "@/src/services/booking-cancellation";
import { getPublicShopContext } from "@/src/services/public-context";

export type ProfileFormState = {
  ok?: boolean;
  error?: string;
};

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const profileSchema = z
  .object({
    name: z.string().trim().min(2, "Bitte den Namen angeben.").max(100),
    phone: optionalTrimmed(30),
    billingStreet: optionalTrimmed(120),
    billingZip: optionalTrimmed(10),
    billingCity: optionalTrimmed(80),
    billingCountry: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v === "" ? null : v))
      .pipe(
        z
          .string()
          .length(2, "Ländercode mit 2 Buchstaben angeben (z. B. DE).")
          .nullable(),
      ),
  })
  .superRefine((v, ctx) => {
    const parts = [v.billingStreet, v.billingZip, v.billingCity, v.billingCountry];
    const some = parts.some(Boolean);
    const all = parts.every(Boolean);
    if (some && !all) {
      ctx.addIssue({
        code: "custom",
        message:
          "Rechnungsadresse bitte vollständig angeben (Straße, PLZ, Ort, Land).",
      });
    }
    if (v.billingCountry === "DE" && v.billingZip && !/^\d{5}$/.test(v.billingZip)) {
      ctx.addIssue({
        code: "custom",
        message: "Für Deutschland bitte eine 5-stellige PLZ angeben.",
      });
    }
  });

export async function saveProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Nicht angemeldet." };
  }

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    billingStreet: formData.get("billingStreet") ?? "",
    billingZip: formData.get("billingZip") ?? "",
    billingCity: formData.get("billingCity") ?? "",
    billingCountry: formData.get("billingCountry") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  await updateProfile(session.user.id, parsed.data);
  revalidatePath("/konto");
  return { ok: true };
}

export type MembershipRequestState = {
  ok?: string;
  error?: string;
};

export async function requestMembership(
  _prev: MembershipRequestState,
  formData: FormData,
): Promise<MembershipRequestState> {
  const session = await auth();
  if (!session?.user) return { error: "Nicht angemeldet." };

  const clubId = String(formData.get("clubId") ?? "");
  if (!clubId) return { error: "Verein fehlt." };

  const shop = await getPublicShopContext();
  if (!shop) return { error: "Aktuell nicht möglich." };

  const result = await requestClubMembership(shop.ctx, session.user.id, clubId);

  // Vereins-Admins benachrichtigen (E-005); ohne Admins geht die Mail an
  // die Vereins-Kontaktadresse. Mailfehler blockieren die Anfrage nicht.
  if (result === "created") {
    const club = await findClubBasics(shop.ctx, clubId);
    if (club) {
      const admins = await findClubAdmins(shop.ctx, clubId);
      const recipients =
        admins.length > 0
          ? admins.map((a) => a.user.email)
          : [club.contactEmail];
      const applicantLabel = session.user.name
        ? `${session.user.name} (${session.user.email})`
        : (session.user.email ?? "Unbekannt");
      const vereinUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/verein`;
      for (const to of recipients) {
        await sendEmail({
          to,
          subject: `Neue Mitgliedschaftsanfrage – ${club.name}`,
          react: ClubRequestMail({
            brandName: getBrandName(),
            clubName: club.name,
            applicantLabel,
            vereinUrl,
          }),
          template: CLUB_REQUEST_TEMPLATE,
          templateVersion: CLUB_REQUEST_VERSION,
          refType: "club-request",
          refId: `${clubId}:${session.user.id}`,
        }).catch(() => {});
      }
    }
  }

  revalidatePath("/konto");
  return result === "created"
    ? { ok: "Anfrage gesendet – der Verein prüft deine Mitgliedschaft." }
    : { ok: "Deine Anfrage liegt dem Verein bereits vor." };
}

// --- Sicherheit: Passwort ändern / E-Mail wechseln (A1-Nachtrag) -----------

export type SecurityFormState = { ok?: string; error?: string };

const changePasswordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z
      .string()
      .min(10, "Das neue Passwort muss mindestens 10 Zeichen haben."),
    newPasswordRepeat: z.string(),
  })
  .refine((v) => v.newPassword === v.newPasswordRepeat, {
    message: "Die neuen Passwörter stimmen nicht überein.",
  });

export async function changeMyPassword(
  _prev: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  const session = await auth();
  if (!session?.user) return { error: "Nicht angemeldet." };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword"),
    newPasswordRepeat: formData.get("newPasswordRepeat"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  try {
    await changePassword({
      userId: session.user.id,
      currentPassword: parsed.data.currentPassword || null,
      newPassword: parsed.data.newPassword,
    });
    return { ok: "Passwort geändert." };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

const changeEmailSchema = z.object({
  newEmail: z.email("Bitte eine gültige E-Mail-Adresse angeben."),
  currentPassword: z.string().min(1, "Bitte das aktuelle Passwort angeben."),
});

export async function changeMyEmail(
  _prev: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  const session = await auth();
  if (!session?.user) return { error: "Nicht angemeldet." };

  const parsed = changeEmailSchema.safeParse({
    newEmail: String(formData.get("newEmail") ?? "").trim().toLowerCase(),
    currentPassword: formData.get("currentPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  if (
    !checkRateLimit(`emailchange:${session.user.id}`, {
      limit: Number(process.env.REGISTER_RATE_LIMIT ?? 3),
      windowMs: 15 * 60 * 1000,
    })
  ) {
    return { error: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen." };
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";

  try {
    await requestEmailChange({
      userId: session.user.id,
      newEmail: parsed.data.newEmail,
      currentPassword: parsed.data.currentPassword,
      baseUrl: `${proto}://${host}`,
    });
    return {
      ok: "Bestätigungslink an die neue Adresse gesendet – erst nach dem Klick wird gewechselt.",
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export type CancelBookingState = {
  ok?: string;
  error?: string;
};

export async function cancelMyBooking(
  _prev: CancelBookingState,
  formData: FormData,
): Promise<CancelBookingState> {
  const session = await auth();
  if (!session?.user) return { error: "Nicht angemeldet." };

  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) return { error: "Buchung fehlt." };

  const shop = await getPublicShopContext();
  if (!shop) return { error: "Aktuell nicht möglich." };

  try {
    const result = await cancelBookingByCustomer(shop.ctx, {
      bookingId,
      userId: session.user.id,
    });
    revalidatePath("/konto");
    if (result.refundMode === "MONEY" && result.creditNoteNumber) {
      return { ok: `Storniert – Erstattung ist unterwegs (${result.creditNoteNumber}).` };
    }
    if (result.refundMode === "CREDIT" && result.amountCents > 0) {
      return { ok: "Storniert – der Betrag wurde deinem Guthaben gutgeschrieben." };
    }
    return { ok: "Buchung storniert." };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}
