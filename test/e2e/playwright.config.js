import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  use: { headless: true, viewport: { width: 1280, height: 800 } },
  reporter: "list",
});
