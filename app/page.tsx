import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getPublicShopContext } from "@/src/services/public-context";

export default async function HomePage() {
  const shop = await getPublicShopContext();

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col items-center justify-center gap-6 p-4 text-center">
      <h1 className="text-3xl font-semibold">
        {shop ? shop.venue.name : "Buchung"}
      </h1>
      <p className="text-muted-foreground text-sm">
        Beachvolleyball in der Halle – Dauerplätze im Vorverkauf
        {shop ? ` für die ${shop.season.name}` : ""}.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/vorverkauf" className={buttonVariants()}>
          Zum Dauerplatz-Vorverkauf
        </Link>
        <Link href="/konto" className={buttonVariants({ variant: "outline" })}>
          Mein Konto
        </Link>
      </div>
      <p className="text-muted-foreground text-xs">
        Einzelbuchungen im Kalender öffnen zum Hallenstart.
      </p>
    </main>
  );
}
