import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defineConfig } from "@playwright/test";

/**
 * Read the site password the dev server is actually using.
 *
 * Taking it from `.env.local` rather than requiring it on the command line
 * keeps the two in step: the dev server reloads that file on change, so a run
 * configured from anywhere else silently starts failing every assertion with a
 * 401 that looks like a broken page.
 */
function sitePassword(): string {
  if (process.env.SITE_PASSWORD) return process.env.SITE_PASSWORD;
  try {
    // __dirname, not import.meta: Playwright loads this config as CommonJS.
    const match = readFileSync(join(__dirname, ".env.local"), "utf8").match(
      /^SITE_PASSWORD=(.*)$/m,
    );
    return match?.[1].trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Drives the local stack through a real browser.
 *
 * The site sits behind Basic Auth, so every request needs credentials —
 * `httpCredentials` supplies them per context rather than through a URL, which
 * Chrome refuses for top-level navigation. The password comes from the
 * environment or `.env.local`, never from the repo.
 *
 * No `webServer` block: the dev server and the FastAPI backend are started
 * separately, because these runs exist to check behaviour against real data in
 * the local Supabase stack, not against a fresh throwaway process.
 *
 * `BASE_URL` retargets the whole suite at a deployed environment. The two spec
 * files guard themselves against running in the wrong one — the local suite
 * asserts against seeded students that production does not have, and the
 * production suite writes a record that has no business existing locally.
 */
export default defineConfig({
  testDir: "./e2e",
  // Generous, because the backend runs on a free tier that sleeps: a first
  // write after idle can wait out a cold start of several tens of seconds.
  timeout: 90_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    httpCredentials: {
      username: "verify",
      password: sitePassword(),
    },
    screenshot: "only-on-failure",
  },
});
