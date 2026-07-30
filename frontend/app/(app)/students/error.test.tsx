import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Error from "./error";

describe("students error boundary", () => {
  it("renders the failure card instead of a blank screen", () => {
    render(
      <Error error={new globalThis.Error("backend unreachable")} unstable_retry={vi.fn()} />,
    );

    expect(screen.getByText("暂时无法加载学员数据")).toBeTruthy();
  });

  it("covers both waking-up and genuine-outage causes, asserting neither", () => {
    // The frontend cannot tell a cold start apart from a real outage, so the
    // copy must hold for both readings rather than claim one.
    render(
      <Error error={new globalThis.Error("backend unreachable")} unstable_retry={vi.fn()} />,
    );

    const body = screen.getByTestId("error-body").textContent ?? "";
    expect(body).toContain("唤醒");
    expect(body).toContain("异常");
  });

  it("styles the retry button with the primary design token", () => {
    render(
      <Error error={new globalThis.Error("backend unreachable")} unstable_retry={vi.fn()} />,
    );

    const retry = screen.getByRole("button", { name: "重试" });
    expect(retry.className).toMatch(/bg-primary/);
  });

  it("re-fetches on retry rather than only clearing the error state", async () => {
    // Must call `unstable_retry`, not `reset`: per Next's error.js docs, reset
    // re-renders the children *without re-fetching*, which would leave the user
    // staring at the same failure. Only a re-fetch can pick up a backend that
    // has since woken from cold start.
    const retry = vi.fn();
    render(
      <Error error={new globalThis.Error("backend unreachable")} unstable_retry={retry} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
