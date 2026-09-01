import Link from "next/link";

import { confirmRegistration } from "@/src/services/registration";

const MESSAGES = {
  ok: {
    title: "E-Mail bestätigt",
    text: "Deine Registrierung ist abgeschlossen. Du kannst dich jetzt anmelden.",
  },
  invalid: {
    title: "Link ungültig",
    text: "Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet.",
  },
  expired: {
    title: "Link abgelaufen",
    text: "Der Bestätigungslink ist abgelaufen. Bitte registriere dich erneut oder melde dich per Anmeldelink an – das bestätigt deine Adresse ebenfalls.",
  },
} as const;

export default async function BestaetigenPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const params = await searchParams;
  const result =
    params.email && params.token
      ? await confirmRegistration(params.email, params.token)
      : ("invalid" as const);
  const message = MESSAGES[result];

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">{message.title}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{message.text}</p>
      <Link href="/login" className="text-sm underline">
        Zur Anmeldung
      </Link>
    </main>
  );
}
