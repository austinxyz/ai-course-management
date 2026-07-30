import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("students loading state", () => {
  it("names what is loading", () => {
    render(<Loading />);

    expect(screen.getByText("正在加载学员数据…")).toBeTruthy();
  });

  it("warns about the cold-start wait instead of only saying 加载中", () => {
    // A bare spinner reads as "frozen" after 20 seconds, and the user refreshes
    // — which throws away the cold start already in progress. The copy has to
    // set the expectation up front.
    render(<Loading />);

    const body = screen.getByTestId("loading-body").textContent ?? "";
    expect(body).toContain("1 分钟");
    expect(body).toContain("不必刷新");
  });

  /**
   * The shell is a flex row: sidebar, then this. Sizing to the viewport
   * (`min-h-screen`) made the card sit hard against the sidebar and overflow
   * the shell's own height — the state has to fill the space left over, not
   * the window.
   */
  it("fills the content area rather than the viewport", () => {
    const { container } = render(<Loading />);

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("flex-1");
    expect(root.className).not.toContain("min-h-screen");
  });
});
