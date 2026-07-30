import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AppError from "./error";

describe("app shell error boundary", () => {
  it("renders the failure card instead of a blank screen", () => {
    render(<AppError error={new globalThis.Error("backend unreachable")} unstable_retry={vi.fn()} />);

    expect(screen.getByText("暂时无法加载数据")).toBeTruthy();
  });

  /**
   * One card for every data page in the shell. The copy never named the page
   * anyway — it describes the backend, and the backend is the same one.
   */
  it("does not name a single section", () => {
    render(<AppError error={new globalThis.Error("boom")} unstable_retry={vi.fn()} />);

    expect(screen.queryByText(/学员数据/)).toBeNull();
  });

  it("covers both waking-up and genuine-outage causes, asserting neither", () => {
    render(<AppError error={new globalThis.Error("boom")} unstable_retry={vi.fn()} />);

    const body = screen.getByTestId("error-body").textContent ?? "";
    expect(body).toContain("唤醒");
    expect(body).toContain("异常");
  });

  /**
   * `reset` re-renders the children *without re-fetching* — the user would
   * click 重试 and land straight back on this card. Asserting only that
   * something was called cannot tell the two apart, so assert both directions.
   */
  it("re-fetches on retry and does not merely reset the subtree", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    render(
      <AppError
        error={new globalThis.Error("boom")}
        unstable_retry={retry}
        // @ts-expect-error — reset is not part of our props; passing it proves
        // the component ignores it rather than falling back to it.
        reset={reset}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it("fills the content area rather than the viewport", () => {
    const { container } = render(
      <AppError error={new globalThis.Error("boom")} unstable_retry={vi.fn()} />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("flex-1");
    expect(root.className).not.toContain("min-h-screen");
  });
});
