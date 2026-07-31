import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import InteractionsPage from "./interactions/page";
import NudgePage from "./nudge/page";

/**
 * The four unbuilt sections each own a route now.
 *
 * They used to be branches inside StudentsClient, reached by setting view
 * state. Routes keep the roster component from being the place every future
 * section has to be added, and they make "还没做" a fact about a URL rather than
 * about one component's state.
 *
 * 报课曾经也在这里，作业也是。两者现在都有真页面了，所以从这份名单里移除——
 * 留着的话这份测试会声称一件不再为真的事。
 */
describe("placeholder routes", () => {
  // 报课不再是占位页（enrollment-backfill 换成了只读总表）；
  // 作业也不再是（homework 换成了 grades.csv 的只读镜像）。
  it.each([
    ["催作业", NudgePage],
    ["互动记录", InteractionsPage],
  ])("%s renders its placeholder page", (title, Page) => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText("未开始设计")).toBeInTheDocument();
  });

  it("offers a way back to the roster as a link", () => {
    render(<NudgePage />);

    expect(screen.getByRole("link", { name: "返回学员名单" })).toHaveAttribute(
      "href",
      "/students",
    );
  });
});
