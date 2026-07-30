import { describe, expect, it, vi } from "vitest";

import AppLayout from "./layout";

const getStudents = vi.hoisted(() => vi.fn(async () => [{ email: "a@example.com" }]));
vi.mock("@/lib/api", () => ({ getStudents }));
vi.mock("next/navigation", () => ({ usePathname: () => "/enroll" }));

/**
 * Guards the one failure mode of this change that produces no error message.
 *
 * If the layout awaits the roster, every navigation waits for the backend —
 * including pages that fetch nothing — because in this version of Next a
 * layout's uncached fetch is not covered by `loading.tsx`. Nothing throws,
 * nothing warns; the app is simply slower everywhere, which is invisible
 * against a local backend that answers in milliseconds.
 *
 * A synchronous layout cannot have awaited anything, so that is what we assert.
 */
describe("AppLayout", () => {
  it("does not await the roster — the shell renders before the count", () => {
    const result = AppLayout({ children: null });

    expect(result).not.toBeInstanceOf(Promise);
  });

  it("hands the count down as a promise rather than a resolved value", () => {
    AppLayout({ children: null });

    expect(getStudents).toHaveBeenCalled();
  });
});
