import Link from "next/link";

import { ResetForm } from "./reset-form";

export default async function PasswortZuruecksetzenPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const params = await searchParams;
  const email = params.email ?? "";
  const token = params.token ?? "";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      {email && token ? (
        <ResetForm email={email} token={token} />
      ) : (
        <p className="text-sm">
          Der Link ist unvollständig.{" "}
          <Link href="/passwort-vergessen" className="text-coral-deep font-bold hover:underline">
            Neuen Link anfordern
          </Link>
        </p>
      )}
      <Link href="/login" className="text-muted-foreground text-sm hover:underline">
        ← Zurück zur Anmeldung
      </Link>
    </main>
  );
}
