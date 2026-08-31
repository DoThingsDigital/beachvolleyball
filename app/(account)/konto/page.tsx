import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { auth } from "@/src/auth";

import { logout } from "@/app/(public)/login/actions";

export default async function KontoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/konto");
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">Mein Konto</h1>
      <p className="text-sm">
        Angemeldet als{" "}
        <span data-testid="session-email" className="font-medium">
          {session.user.email}
        </span>
      </p>
      <form action={logout}>
        <Button type="submit" variant="outline">
          Abmelden
        </Button>
      </form>
    </main>
  );
}
