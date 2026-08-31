import { redirect } from "next/navigation";

import { auth } from "@/src/auth";

import { LoginForm } from "./login-form";

const ERROR_MESSAGES: Record<string, string> = {
  Verification:
    "Der Anmeldelink ist ungültig oder abgelaufen. Bitte einen neuen anfordern.",
  CredentialsSignin: "E-Mail-Adresse oder Passwort ist falsch.",
  Default: "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user) {
    redirect("/konto");
  }

  const callbackUrl =
    params.callbackUrl?.startsWith("/") && !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/konto";
  const errorMessage = params.error
    ? (ERROR_MESSAGES[params.error] ?? ERROR_MESSAGES.Default)
    : undefined;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold">Anmelden</h1>
      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <LoginForm callbackUrl={callbackUrl} />
    </main>
  );
}
