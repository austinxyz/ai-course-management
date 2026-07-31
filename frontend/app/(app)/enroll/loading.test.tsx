import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

/**
 * 没有加载态的数据页，Next 会**保持上一个页面**直到 RSC 到达——点了像没反应。
 * 后端冷启动时那是几十秒。这正是 course-page-boundaries 修掉的形状，
 * 新加的数据页不该再犯一遍。
 */
describe("报课总表的加载态", () => {
  it("说明正在加载什么", () => {
    render(<Loading />);

    expect(screen.getByText("正在加载报课数据…")).toBeTruthy();
  });

  it("提前说明可能的长等待，而不是只说「加载中」", () => {
    render(<Loading />);

    const body = screen.getByTestId("loading-body").textContent ?? "";
    expect(body).toContain("1 分钟");
    expect(body).toContain("不必刷新");
  });

  it("填满内容区而不是整个视口", () => {
    const { container } = render(<Loading />);

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("flex-1");
    expect(root.className).not.toContain("min-h-screen");
  });
});
