import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ belongs to Playwright. Left in, vitest tries to run those specs and
    // fails on @playwright/test's imports.
    exclude: ["node_modules/**", "e2e/**"],
    globals: true,
  },
});
