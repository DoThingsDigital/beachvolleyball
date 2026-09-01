import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 1 : 2,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 1 Retry: parallele Specs teilen sich Server + DB
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
  // Production-Build statt Dev-Server: der Webpack-Dev-Server degradiert
  // bei langen Läufen (Compile-Races, "frame.join"-Crashes) – der
  // Prod-Server ist stabil und schneller. Ein laufender Dev-Server auf
  // :3000 muss vor `pnpm e2e` gestoppt werden (reuse bewusst aus).
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 420_000,
  },
});
