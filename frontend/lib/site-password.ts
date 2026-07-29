/**
 * The one place the shared site password is compared.
 *
 * Two callers need this check: `proxy.ts`, which gates page requests, and the
 * Server Actions in `app/students/actions.ts`, which gate writes. Server
 * Functions are reachable by a direct POST regardless of what the proxy's
 * matcher covers, so the second check is not redundant with the first — but
 * two copies of the comparison would be, and the copy that drifts is the one
 * nobody looks at.
 */
export function checkSitePassword(authorizationHeader: string | null): boolean {
  const expected = process.env.SITE_PASSWORD;

  // Kept as its own check rather than folded into the comparison below.
  // `if (expected && provided !== expected)` reads the same but admits the
  // entire internet whenever the variable is unset — and nothing about that
  // looks wrong from the outside. Denying instead means a missing password
  // locks *us* out on the first request, which is a problem that announces
  // itself.
  if (!expected) return false;

  const provided = readBasicPassword(authorizationHeader);
  return provided !== null && provided === expected;
}

function readBasicPassword(header: string | null): string | null {
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
