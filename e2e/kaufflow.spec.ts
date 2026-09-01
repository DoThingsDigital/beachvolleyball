import { createHash, randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import Stripe from "stripe";

// Ticket 3.7 (NF9): kompletter Kaufflow E2E, CI-fähig ohne Stripe-Account.
// Registrierung → Bestätigung → Kauf (Hold) → signierte Webhook-Events
// direkt an /api/webhooks/stripe → Bestellung bezahlt + Rechnung; Fehlerfall.
// Die Signatur nutzt STRIPE_WEBHOOK_SECRET aus der Umgebung – identisch zu
// dem, womit der Server prüft.

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const BASE = "http://localhost:3000";

function pool() {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

async function registerAndVerify(page: Page, email: string, password: string) {
  await page.goto("/registrieren");
  await page.locator("#reg-email").fill(email);
  await page.locator("#reg-name").fill("Kaufflow Kunde");
  await page.locator("#reg-password").fill(password);
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Registrieren" }).click();
  // inhaltsbasiert statt URL: Server-Action-Redirects zeigen die Ziel-URL
  // je nach Timing verzögert an
  await expect(
    page.getByRole("heading", { name: "Fast geschafft" }),
  ).toBeVisible();

  const db = pool();
  try {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await db.query(
      `INSERT INTO "VerificationToken" (identifier, token, expires)
       VALUES ($1, $2, now() + interval '15 minutes')`,
      [`verify:${email}`, tokenHash],
    );
    await page.goto(
      `/registrieren/bestaetigen?email=${encodeURIComponent(email)}&token=${rawToken}`,
    );
    await expect(
      page.getByRole("heading", { name: "E-Mail bestätigt" }),
    ).toBeVisible();
  } finally {
    await db.end();
  }

  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByTestId("session-email")).toHaveText(email);

  // Rechnungsadresse (A2, Pflicht vor Kauf)
  await page.locator("#profile-street").fill("Kaufweg 7");
  await page.locator("#profile-zip").fill("51063");
  await page.locator("#profile-city").fill("Köln");
  await page.locator("#profile-country").fill("DE");
  await page.getByRole("button", { name: "Profil speichern" }).click();
  await expect(page.getByRole("status")).toHaveText("Gespeichert.");
}

async function buySubscription(page: Page): Promise<string> {
  // Freitag: dort blockt kein Vereinskontingent; das Raster zeigt nur freie
  // Kombinationen, daher einfach die erste freie Fr-Zelle nehmen.
  await page.goto("/vorverkauf?dauer=60");
  await page
    .getByRole("link", { name: /^Fr \d{2}:\d{2}, \d+ Plätze frei$/ })
    .first()
    .click();
  await page
    .locator("section", { hasText: "Platz wählen" })
    .getByRole("link", { name: /^(Feld|E2E)/ })
    .first()
    .click();
  await expect(page.getByTestId("quote-total")).toBeVisible();
  await page.locator("#checkout-terms").check();
  await page.getByRole("button", { name: "Weiter zum Checkout" }).click();

  await expect(page).toHaveURL(/\/bestellung\//);
  const url = page.url();
  const orderId = url.split("/bestellung/")[1]!.split("?")[0]!;
  await expect(page.getByTestId("order-status")).toHaveText("Warten auf Zahlung");
  return orderId;
}

async function sendSignedEvent(
  page: Page,
  type: string,
  orderId: string,
  piId: string,
  amount: number,
) {
  const payload = JSON.stringify({
    id: `evt_e2e_${randomBytes(8).toString("hex")}`,
    object: "event",
    type,
    data: {
      object: {
        id: piId,
        object: "payment_intent",
        amount,
        metadata: { orderId },
        payment_method_types: ["sepa_debit"],
        latest_charge: null,
        payment_method: "pm_e2e",
        last_payment_error: null,
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  const status = await page.evaluate(
    async ({ base, body, sig }) => {
      const res = await fetch(`${base}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "stripe-signature": sig, "content-type": "application/json" },
        body,
      });
      return res.status;
    },
    { base: BASE, body: payload, sig: signature },
  );
  expect(status).toBe(200);
}

test.beforeAll(() => {
  if (!WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET fehlt in der Umgebung.");
  }
});

test("Kaufflow: Registrierung → Kauf → Zahlung → Rechnung", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  const email = `e2e-kauf-${Date.now()}@example.org`;
  await registerAndVerify(page, email, "kaufflow-passwort-1");
  const orderId = await buySubscription(page);

  // SEPA: processing → succeeded (signierte Events wie von Stripe)
  const piId = `pi_e2e_${Date.now()}`;
  await sendSignedEvent(page, "payment_intent.processing", orderId, piId, 1);
  await sendSignedEvent(page, "payment_intent.succeeded", orderId, piId, 1);

  await page.goto(`/bestellung/${orderId}`);
  await expect(page.getByTestId("order-status")).toHaveText("Bezahlt");
  await expect(page.getByTestId("invoice-download")).toBeVisible();

  // Rechnung + Mails im Protokoll (Versandstatus je nach Provider-Modus)
  const db = pool();
  try {
    const { rows: invoices } = await db.query(
      `SELECT number FROM "Invoice" WHERE "orderId" = $1 AND type = 'INVOICE'`,
      [orderId],
    );
    expect(invoices).toHaveLength(1);
    const { rows: mails } = await db.query(
      `SELECT template FROM "EmailLog" WHERE "refType" = 'order' AND "refId" = $1
       UNION ALL
       SELECT template FROM "EmailLog" e JOIN "Invoice" i ON e."refId" = i.id
       WHERE i."orderId" = $1`,
      [orderId],
    );
    const templates = mails.map((m) => m.template);
    expect(templates).toContain("order-confirmation");
    expect(templates).toContain("invoice");
  } finally {
    await db.end();
  }
});

test("Kaufflow-Fehlerfall: Zahlung schlägt fehl → Bestellung storniert", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "einmal pro Lauf");

  const email = `e2e-fail-${Date.now()}@example.org`;
  await registerAndVerify(page, email, "kaufflow-passwort-2");
  const orderId = await buySubscription(page);

  await sendSignedEvent(
    page,
    "payment_intent.payment_failed",
    orderId,
    `pi_fail_${Date.now()}`,
    1,
  );

  await page.goto(`/bestellung/${orderId}`);
  await expect(page.getByTestId("order-status")).toHaveText("Storniert");

  const db = pool();
  try {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM "EmailLog" WHERE template = 'payment-failed' AND "refId" = $1`,
      [orderId],
    );
    expect(rows[0].n).toBe(1);
  } finally {
    await db.end();
  }
});
