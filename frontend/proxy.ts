import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { checkSitePassword } from "./lib/site-password";

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
  // The comparison itself lives in lib/site-password.ts because the Server
  // Actions need the identical check — a direct POST to a Server Function does
  // not necessarily pass through here.
  if (!checkSitePassword(request.headers.get("Authorization"))) {
    return unauthorized();
  }

  return NextResponse.next();
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
