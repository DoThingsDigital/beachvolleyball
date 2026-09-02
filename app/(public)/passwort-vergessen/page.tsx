import Link from "next/link";

import { ForgotForm } from "./forgot-form";

export default function PasswortVergessenPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <ForgotForm />
      <Link href="/login" className="text-muted-foreground text-sm hover:underline">
        ← Zurück zur Anmeldung
      </Link>
    </main>
  );
}
