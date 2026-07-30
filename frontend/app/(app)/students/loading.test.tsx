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
});
