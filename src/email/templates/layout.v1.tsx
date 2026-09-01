import type { ReactNode } from "react";

// Basis-Layout v1 für alle Transaktionsmails: tabellenfrei, inline-styles,
// dunkle Schrift auf hellem Grund (breite Client-Kompatibilität).
// brandName kommt aus der Konfiguration (MAIL_BRAND_NAME), nie hardcodiert.

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: "#f4f4f5",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  container: {
    maxWidth: "480px",
    margin: "0 auto",
    padding: "32px 16px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    padding: "32px 24px",
  },
  brand: {
    fontSize: "18px",
    fontWeight: 700 as const,
    color: "#18181b",
    marginBottom: "24px",
  },
  footer: {
    fontSize: "12px",
    color: "#71717a",
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
    color: "#3f3f46",
    lineHeight: "1.6",
    margin: "0 0 16px",
  },
  button: {
    display: "inline-block",
    backgroundColor: "#18181b",
    color: "#ffffff",
    padding: "12px 24px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 600 as const,
    textDecoration: "none",
  },
  linkFallback: {
    fontSize: "12px",
    color: "#71717a",
    wordBreak: "break-all" as const,
    margin: "16px 0 0",
  },
} as const;
