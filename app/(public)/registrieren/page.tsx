import { redirect } from "next/navigation";

import { auth } from "@/src/auth";
import { findOrganisationBySlug } from "@/src/db/registration";

import { RegisterForm } from "./register-form";

export default async function RegistrierenPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/konto");
  }

  const org = await findOrganisationBySlug(process.env.DEFAULT_ORG_SLUG ?? "dtd");
  const settings = org?.settings as { termsVersion?: string } | null;
  const termsVersion = settings?.termsVersion ?? "v1";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold">Registrieren</h1>
      <RegisterForm termsVersion={termsVersion} />
    </main>
  );
}
