import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: { command: "npm run dev -- --port 3101", url: "http://127.0.0.1:3101", env: { SYNCARE_WEB_ORIGIN: "http://127.0.0.1:3101", SYNCARE_ALLOW_LOCAL_HTTP: "true" }, reuseExistingServer: false, timeout: 120000 },
});

