import Link from "next/link";

const TABS = [
  { href: "/admin/konfiguration/standort", label: "Standort" },
  { href: "/admin/konfiguration/plaetze", label: "Plätze" },
  { href: "/admin/konfiguration/saisons", label: "Saisons" },
  { href: "/admin/konfiguration/vereine", label: "Vereine" },
  { href: "/admin/konfiguration/aussteller", label: "Aussteller" },
  { href: "/admin/konfiguration/preisregeln", label: "Preisregeln" },
] as const;

export default function KonfigurationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <nav
        aria-label="Konfiguration"
        className="flex gap-1 overflow-x-auto border-b pb-2"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="hover:bg-accent rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
