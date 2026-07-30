import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("courses loading state", () => {
  it("names what is loading", () => {
    render(<Loading />);

    expect(screen.getByText("正在加载课程数据…")).toBeTruthy();
  });

  /**
   * Without a loading state at all, this version of Next holds the *previous*
   * page on screen until the payload arrives — a click that changes nothing for
   * however long the backend takes to wake. Naming the wait is what stops that
   * from reading as a dead button.
   */
  it("warns about the cold-start wait instead of only saying 加载中", () => {
    render(<Loading />);

    const body = screen.getByTestId("loading-body").textContent ?? "";
    expect(body).toContain("1 分钟");
    expect(body).toContain("不必刷新");
  });

  it("fills the content area rather than the viewport", () => {
    const { container } = render(<Loading />);

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("flex-1");
    expect(root.className).not.toContain("min-h-screen");
  });
});
