import { SiteHeader } from "@/components/brand/site-header";

// Konto- und Bestellseiten tragen denselben Marken-Header wie die
// öffentlichen Seiten – das Logo führt immer zurück zur Startseite.
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
