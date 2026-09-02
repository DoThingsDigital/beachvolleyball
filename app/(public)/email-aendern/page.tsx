import Link from "next/link";

import { confirmEmailChange } from "@/src/services/account";

// Bestätigung des E-Mail-Wechsels (Link aus der Mail an die neue Adresse).
// Ohne Login nutzbar: der Token beweist Kontrolle über die neue Mailbox
// und wurde nur nach Passwort-Prüfung erzeugt.
export default async function EmailAendernPage({
  searchParams,
}: {
  searchParams: Promise<{ uid?: string; email?: string; token?: string }>;
}) {
  const params = await searchParams;
  const uid = params.uid ?? "";
  const email = params.email ?? "";
  const token = params.token ?? "";

  const result =
    uid && email && token
      ? await confirmEmailChange({ userId: uid, newEmail: email, token })
      : ("invalid" as const);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      {result === "ok" ? (
        <>
          <h1 className="text-2xl font-semibold">E-Mail-Adresse geändert</h1>
          <p className="text-sm">
            Dein Konto nutzt jetzt <strong>{email}</strong>. Bitte melde dich
            damit neu an.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Link ungültig</h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            {result === "expired"
              ? "Der Bestätigungslink ist abgelaufen."
              : result === "conflict"
                ? "Diese E-Mail-Adresse wird inzwischen anderweitig verwendet."
                : "Der Bestätigungslink ist ungültig oder wurde bereits verwendet."}{" "}
            Fordere den Wechsel im Konto einfach erneut an.
          </p>
        </>
      )}
      <Link
        href="/login"
        className="text-coral-deep text-sm font-bold hover:underline"
      >
        Zur Anmeldung →
      </Link>
    </main>
  );
}
