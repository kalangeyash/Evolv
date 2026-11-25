import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the *production* static export, served under the
 * same /Evolv base path GitHub Pages uses. Build first: BASE_PATH=/Evolv pnpm build
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173/Evolv/",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-out.mjs",
    env: { BASE_PATH: "/Evolv", PORT: "4173" },
    url: "http://localhost:4173/Evolv/",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
