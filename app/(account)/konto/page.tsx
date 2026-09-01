import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { auth } from "@/src/auth";
import { findProfile } from "@/src/db/users";

import { logout } from "@/app/(public)/login/actions";

import { ProfileForm } from "./profile-form";

export default async function KontoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/konto");
  }

  const profile = await findProfile(session.user.id);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mein Konto</h1>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Abmelden
          </Button>
        </form>
      </div>
      <p className="text-sm">
        Angemeldet als{" "}
        <span data-testid="session-email" className="font-medium">
          {session.user.email}
        </span>
        {profile?.termsAcceptedVersion ? (
          <span className="text-muted-foreground">
            {" "}
            · AGB akzeptiert (Version {profile.termsAcceptedVersion})
          </span>
        ) : null}
      </p>
      <ProfileForm
        values={{
          name: profile?.name ?? "",
          phone: profile?.phone ?? "",
          billingStreet: profile?.billingStreet ?? "",
          billingZip: profile?.billingZip ?? "",
          billingCity: profile?.billingCity ?? "",
          billingCountry: profile?.billingCountry ?? "",
        }}
      />
    </main>
  );
}
