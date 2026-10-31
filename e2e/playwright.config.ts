import { defineConfig, devices } from "@playwright/test";

const API_PORT = 4110;
const WEB_PORT = 5191;

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "retain-on-failure", locale: "en-GB" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "npm -w apps/api run e2e:server",
      cwd: "..",
      url: `http://localhost:${API_PORT}/api/health`,
      env: { E2E_API_PORT: String(API_PORT) },
      timeout: 240_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: "../apps/web",
      url: `http://localhost:${WEB_PORT}`,
      env: { API_URL: `http://localhost:${API_PORT}`, WEB_PORT: String(WEB_PORT) },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
