import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Shared-password gate over the whole site.
 *
 * This file must be named `proxy.ts` and sit beside `app/` — the `middleware`
 * convention was renamed in this version of Next.js. A file under the old name
 * is simply never invoked, and the symptom of that mistake is the site loading
 * normally, which is indistinguishable from the gate working. Any change here
 * needs checking against a real unauthenticated request, not against "the page
 * still opens".
 */
export default function proxy(request: NextRequest): NextResponse {
  const expected = process.env.SITE_PASSWORD;

  // Kept as its own check rather than folded into the comparison below.
  // `if (expected && provided !== expected)` reads the same but admits the
  // entire internet whenever the variable is unset — and nothing about that
  // looks wrong from the outside. Denying instead means a missing password
  // locks *us* out on the first request, which is a problem that announces
  // itself.
  if (!expected) return unauthorized();

  const provided = readBasicPassword(request);
  if (!provided || provided !== expected) return unauthorized();

  return NextResponse.next();
}

function readBasicPassword(request: NextRequest): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Basic ")) return null;

  try {
    const decoded = atob(header.slice("Basic ".length));
    // "user:password" — the username is unused, everyone shares one password.
    // Split on the first colon only; passwords may legitimately contain one.
    const separator = decoded.indexOf(":");
    return separator === -1 ? null : decoded.slice(separator + 1);
  } catch {
    // Malformed base64 — treat as no credentials rather than a server error.
    return null;
  }
}

function unauthorized(): NextResponse {
  // Without WWW-Authenticate the browser renders a blank 401 and never offers
  // a password prompt, which would lock out the legitimate users too.
  // The realm stays ASCII: header values are ByteStrings, so a Chinese realm
  // throws while constructing the response — turning the 401 into a 500.
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Student Management"' },
  }) as NextResponse;
}

export const config = {
  // Without a matcher the proxy runs on every request including `_next/static`
  // and `_next/image`, which the Next.js docs warn will block CSS, JS and
  // images from loading. Static assets carry no student data — what they
  // expose is the client bundle's own code — and once Basic Auth is accepted
  // the browser attaches credentials to same-origin requests anyway.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
