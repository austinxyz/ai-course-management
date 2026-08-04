import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import InteractionsPage from "./interactions/page";

/**
 * The remaining unbuilt sections each own a route now.
 *
 * They used to be branches inside StudentsClient, reached by setting view
 * state. Routes keep the roster component from being the place every future
 * section has to be added, and they make "还没做" a fact about a URL rather than
 * about one component's state.
 *
 * 报课、作业、催作业都曾经在这里，现在都有真页面了，所以从这份名单里移除——
 * 留着的话这份测试会声称一件不再为真的事。
 */
describe("placeholder routes", () => {
  it.each([["互动记录", InteractionsPage]])("%s renders its placeholder page", (title, Page) => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText("未开始设计")).toBeInTheDocument();
  });

  it("offers a way back to the roster as a link", () => {
    render(<InteractionsPage />);

    expect(screen.getByRole("link", { name: "返回学员名单" })).toHaveAttribute(
      "href",
      "/students",
    );
  });
});
