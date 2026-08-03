import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SidebarWithCount } from "./SidebarWithCount";

vi.mock("next/navigation", () => ({ usePathname: () => "/enroll" }));

/**
 * The count is the shell's only fetch, and this version of Next blocks *every*
 * navigation until a layout's uncached fetch settles — `loading.tsx` does not
 * cover it. So the count must sit behind its own boundary.
 *
 * These tests hand it a promise that never resolves. A test using an
 * already-resolved promise passes whether or not the boundary exists, which
 * makes it blind to exactly the regression worth guarding: forgetting the
 * boundary produces no error and no warning, only a slower app.
 */
describe("SidebarWithCount", () => {
  it("lets the shell render while the count is still in flight", () => {
    const never = new Promise<Partial<Record<import("./students/types").NavKey, number>>>(() => {});

    render(
      <Suspense fallback={<div data-testid="shell">壳先出来了</div>}>
        <SidebarWithCount counts={never} />
      </Suspense>,
    );

    expect(screen.getByTestId("shell")).toBeInTheDocument();
  });

  it("renders the count once it arrives", async () => {
    // `await act` because the component suspends: without it React warns and
    // the assertion runs against the fallback.
    await act(async () => {
      render(
        <Suspense fallback={<div>…</div>}>
          <SidebarWithCount counts={Promise.resolve({ students: 19 })} />
        </Suspense>,
      );
    });

    expect(screen.getByText("19")).toBeInTheDocument();
  });
});
