import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import RootError from "./error";

/**
 * The last stop. The shell's own boundary renders *inside* the shell layout, so
 * it cannot catch that layout throwing; and pages outside the shell (`/`,
 * `/style-guide`) have no boundary above them at all. Without this file those
 * cases fall through to the framework's default screen — English, no retry,
 * nothing like the rest of the app.
 */
describe("root error boundary", () => {
  it("renders a readable card rather than the framework default", () => {
    render(<RootError error={new globalThis.Error("boom")} unstable_retry={vi.fn()} />);

    expect(screen.getByText("页面出错了")).toBeTruthy();
  });

  it("offers a retry that re-fetches", async () => {
    const retry = vi.fn();
    render(<RootError error={new globalThis.Error("boom")} unstable_retry={retry} />);

    await userEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
