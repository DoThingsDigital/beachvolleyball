import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Buchung",
  description: "Platz- und Dauerplatzbuchung",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <footer className="text-muted-foreground border-t p-4 text-center text-xs">
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      </body>
    </html>
  );
}
