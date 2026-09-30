import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: ".local/playwright-results",
  snapshotPathTemplate: "{testDir}/snapshots/{arg}-{platform}{ext}",
  use: {
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx test/browser/server.ts",
    url: "http://127.0.0.1:43917",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
