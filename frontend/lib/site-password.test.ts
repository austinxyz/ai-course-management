// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkSitePassword } from "./site-password";

const PASSWORD = "test-password-not-a-real-one";

function basic(credentials: string): string {
  return `Basic ${btoa(credentials)}`;
}

describe("checkSitePassword", () => {
  const original = process.env.SITE_PASSWORD;

  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SITE_PASSWORD;
    else process.env.SITE_PASSWORD = original;
  });

  it("accepts the shared password", () => {
    expect(checkSitePassword(basic(`anyone:${PASSWORD}`))).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(checkSitePassword(basic("anyone:wrong"))).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(checkSitePassword(null)).toBe(false);
  });

  it("keeps a password that contains a colon intact", () => {
    process.env.SITE_PASSWORD = "has:colon";
    expect(checkSitePassword(basic("anyone:has:colon"))).toBe(true);
  });

  it("denies everyone when SITE_PASSWORD is unset", () => {
    // Fail closed. The opposite mistake — treating an unset variable as "no
    // gate configured, let it through" — opens the site to the whole internet
    // and looks completely normal from the outside. Denying breaks loudly, on
    // our own first request.
    delete process.env.SITE_PASSWORD;
    expect(checkSitePassword(basic("anyone:anything"))).toBe(false);
  });
});
