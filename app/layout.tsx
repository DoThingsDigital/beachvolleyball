import type { Metadata } from "next";
import { Baloo_2, Figtree } from "next/font/google";
import Link from "next/link";
import "./globals.css";

import { Endorsement } from "@/components/brand/logo";

// CI „Picco Winter Beach": Baloo 2 für Headlines/Buttons, Figtree für UI.
const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Picco Winter Beach – Buchung",
  description:
    "Draußen Winter. Hier: Sommer. Beachvolleyball-Plätze und Dauerplätze buchen.",
};

const LEGAL_LINKS = [
  { href: "/recht/impressum", label: "Impressum" },
  { href: "/recht/datenschutz", label: "Datenschutz" },
  { href: "/recht/agb", label: "AGB" },
  { href: "/recht/widerruf", label: "Widerrufshinweis" },
] as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${baloo.variable} ${figtree.variable} antialiased`}>
        {children}
        <footer className="border-divider-warm border-t p-4">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
            <nav className="text-stone flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {LEGAL_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              ))}
            </nav>
            <Endorsement />
          </div>
        </footer>
      </body>
    </html>
  );
}
