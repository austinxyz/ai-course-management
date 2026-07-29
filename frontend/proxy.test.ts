// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PASSWORD = "test-password-not-a-real-one";

function request(credentials?: string): NextRequest {
  const headers = new Headers();
  if (credentials) {
    headers.set("Authorization", `Basic ${btoa(credentials)}`);
  }
  return new NextRequest("https://example.com/students", { headers });
}

describe("proxy", () => {
  const original = process.env.SITE_PASSWORD;

  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SITE_PASSWORD;
    else process.env.SITE_PASSWORD = original;
  });

  it("turns away a request with no credentials", async () => {
    const { default: proxy } = await import("./proxy");

    const res = await proxy(request());

    expect(res.status).toBe(401);
  });

  it("sends WWW-Authenticate so the browser offers a credentials prompt", async () => {
    // Without this header a browser shows a bare 401 and gives the user no way
    // to supply a password — the gate would be closed to everyone, us included.
    const { default: proxy } = await import("./proxy");

    const res = await proxy(request());

    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Basic realm=/);
  });

  it("turns away a request with the wrong password", async () => {
    const { default: proxy } = await import("./proxy");

    const res = await proxy(request(`admin:${PASSWORD}-wrong`));

    expect(res.status).toBe(401);
  });

  it("lets a request with the right password through", async () => {
    const { default: proxy } = await import("./proxy");

    const res = await proxy(request(`admin:${PASSWORD}`));

    expect(res.status).toBe(200);
  });

  it("keeps a password containing a colon intact", async () => {
    // Basic auth packs "user:password"; splitting on every colon would mangle
    // any password that contains one, locking out a perfectly good credential.
    process.env.SITE_PASSWORD = "pa:ss:word";
    const { default: proxy } = await import("./proxy");

    const res = await proxy(request("admin:pa:ss:word"));

    expect(res.status).toBe(200);
  });

  it("locks everyone out when no password is configured, rather than letting them in", async () => {
    // The failure this pins cannot be found by clicking around: written as
    // `if (expected && provided !== expected)`, an unset variable opens the
    // site to everyone while looking completely normal to whoever set a
    // password locally and got in.
    delete process.env.SITE_PASSWORD;
    const { default: proxy } = await import("./proxy");

    const res = await proxy(request(`admin:${PASSWORD}`));

    expect(res.status).toBe(401);
  });
});
