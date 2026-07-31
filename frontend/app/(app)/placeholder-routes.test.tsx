import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EnrollPage from "./enroll/page";
import HomeworkPage from "./homework/page";
import InteractionsPage from "./interactions/page";
import NudgePage from "./nudge/page";

/**
 * The four unbuilt sections each own a route now.
 *
 * They used to be branches inside StudentsClient, reached by setting view
 * state. Routes keep the roster component from being the place every future
 * section has to be added, and they make "报课 is still a placeholder" a fact
 * about a URL rather than about one component's state.
 */
describe("placeholder routes", () => {
  it.each([
    ["报课", EnrollPage],
    ["作业", HomeworkPage],
    ["催作业", NudgePage],
    ["互动记录", InteractionsPage],
  ])("%s renders its placeholder page", (title, Page) => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText("未开始设计")).toBeInTheDocument();
  });

  it("offers a way back to the roster as a link", () => {
    render(<EnrollPage />);

    expect(screen.getByRole("link", { name: "返回学员名单" })).toHaveAttribute(
      "href",
      "/students",
    );
  });
});

/**
 * 报课的**数据主干**已经能用了（enrollment-core），只是这一页本身还没做——
 * 补录入口在学员详情里。占位页若不说这句，站在 /enroll 的人会以为报课整个还没有，
 * 而他其实已经可以录了。
 *
 * 同时"先把学员名单做完"这句已经过时：名单早做完了。占位文案跟着现实走，
 * 否则它就是一句错话，而错话比空白更糟。
 */
describe("报课占位页的文案", () => {
  it("指出补录已经能用，并说明入口在哪", () => {
    render(<EnrollPage />);

    expect(screen.getByText(/学员详情/)).toBeInTheDocument();
  });

  it("不再说「先把学员名单做完」——名单已经做完了", () => {
    render(<EnrollPage />);

    expect(screen.queryByText(/先把学员名单做完/)).toBeNull();
  });
});
