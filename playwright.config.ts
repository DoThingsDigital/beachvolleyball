import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Dev-Server kompiliert Routen beim ersten Hit – Defaults sind zu knapp,
  // und zu viele Worker erzeugen einen Kompilier-Stau.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 1 : 2,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // lokal 1 Retry: parallele Specs teilen sich Dev-Server + DB
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Kernflows müssen auf 375 px laufen (NF7); Chromium-basiert, damit
      // nur ein Browser-Binary nötig ist. Viewport explizit auf 375 px.
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 375, height: 667 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
