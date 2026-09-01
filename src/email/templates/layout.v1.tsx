import type { ReactNode } from "react";

// Basis-Layout v1 für alle Transaktionsmails: tabellenfrei, inline-styles,
// dunkle Schrift auf hellem Grund (breite Client-Kompatibilität).
// brandName kommt aus der Konfiguration (MAIL_BRAND_NAME), nie hardcodiert.

// Farben aus der Picco-CI (shell/ink/coral); Mail-Clients bekommen
// Systemschriften, die Web-App lädt Baloo/Figtree.
const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: "#FFF6EA",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  container: {
    maxWidth: "480px",
    margin: "0 auto",
    padding: "32px 16px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "32px 24px",
    border: "1px solid #E5E1D8",
  },
  brand: {
    fontSize: "18px",
    fontWeight: 800 as const,
    color: "#2B2118",
    marginBottom: "24px",
  },
  footer: {
    fontSize: "12px",
    color: "#9A9284",
    marginTop: "24px",
    lineHeight: "1.5",
  },
} as const;

export function EmailLayout({
  brandName,
  children,
}: {
  brandName: string;
  children: ReactNode;
}) {
  return (
    <html lang="de">
      <body style={styles.body}>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.brand}>{brandName}</div>
            {children}
          </div>
          <p style={styles.footer}>
            Diese E-Mail wurde automatisch versendet. Wenn du sie nicht
            angefordert hast, kannst du sie ignorieren.
          </p>
        </div>
      </body>
    </html>
  );
}

export const emailStyles = {
  text: {
    fontSize: "14px",
    color: "#2B2118",
    lineHeight: "1.6",
    margin: "0 0 16px",
  },
  button: {
    display: "inline-block",
    backgroundColor: "#FF6B4A",
    color: "#ffffff",
    padding: "13px 26px",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: 700 as const,
    textDecoration: "none",
  },
  linkFallback: {
    fontSize: "12px",
    color: "#9A9284",
    wordBreak: "break-all" as const,
    margin: "16px 0 0",
  },
} as const;
