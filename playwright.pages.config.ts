import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  testMatch: ["**/english.e2e.ts", "**/pages.e2e.ts"],
  testIgnore: [],
  use: {
    ...config.use,
    baseURL: "http://127.0.0.1:4173/scratchsembly/",
  },
  webServer: {
    command:
      "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base /scratchsembly/",
    url: "http://127.0.0.1:4173/scratchsembly/",
    reuseExistingServer: false,
  },
});
