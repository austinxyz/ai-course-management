import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HomeworkClient } from "./HomeworkClient";
import type { HomeworkCourse, HomeworkPerson } from "./types";

vi.mock("next/navigation", () => ({ usePathname: () => "/homework" }));

const COURSES: HomeworkCourse[] = [
  { id: "c1", name: "从零开始用 Claude 和 Cowork", short: "S1" },
  { id: "c2", name: "先造枪：建知识库", short: "S2" },
];

function person(over: Partial<HomeworkPerson> = {}): HomeworkPerson {
  return {
    studentEmail: "alpha@example.com",
    name: "学员甲",
    wechat: "",
    state: "submitted",
    submittedAt: "2026-06-11",
    total: 77,
    scores: [
      { item: "A1工作流结构", score: 11 },
      { item: "A3Cowork特性", score: 0 },
    ],
    highlight: "Agent1 提示词详细",
    improve: "补中间输出",
    replyStatus: "待回复",
    sourceRef: "session1/grades.csv:2",
    rank: 3,
    rankOf: 17,
    ...over,
  };
}

function blank(over: Partial<HomeworkPerson> = {}): HomeworkPerson {
  return person({
    state: "missing",
    submittedAt: null,
    total: null,
    scores: [],
    highlight: "",
    improve: "",
    replyStatus: "",
    sourceRef: "",
    rank: null,
    rankOf: 17,
    ...over,
  });
}

function view(people: HomeworkPerson[], courseId = "c1") {
  return render(
    <HomeworkClient courses={COURSES} courseId={courseId} people={people} />,
  );
}

describe("按课程组织", () => {
  it("每门课一个 chip，当前课程高亮", () => {
    view([person()]);

    const s2 = screen.getByRole("link", { name: /S2/ });
    expect(s2).toHaveAttribute("href", "/homework?course=c2");
    expect(screen.getByRole("link", { name: /S1/ }).className).toMatch(/bg-primary/);
  });
});

describe("四态", () => {
  it.each([
    ["submitted", "已交", /bg-success/],
    ["missing", "未交", /bg-danger/],
    ["not_open", "未开放", /bg-muted-foreground/],
    ["no_session", "未定场次", /bg-primary/],
  ])("%s 显示为「%s」并带对应 token", (state, label, token) => {
    view([blank({ state })]);

    const row = screen.getByTestId("homework-alpha@example.com");
    expect(within(row).getByText(label)).toBeInTheDocument();
    expect(within(row).getByTestId("state-dot").className).toMatch(token);
  });

  /**
   * VISUAL DIFF 里看出来的：三种"没交"原本共用 danger 红，于是「未开放」
   * 读起来像出事了 —— 而它是完全正常的状态（这一场还没上）。
   * 颜色是这一列唯一的语气，三种含义不该只有一种语气。
   */
  it.each([
    ["missing", /text-danger/],
    ["no_session", /text-primary/],
    ["not_open", /text-muted/],
  ])("%s 的状态文字用与其语气相符的颜色", (state, token) => {
    view([blank({ state })]);

    const row = screen.getByTestId("homework-alpha@example.com");
    expect(within(row).getByTestId("state-label").className).toMatch(token);
  });

  it("未交的行整行带 danger 底色，一眼扫得到", () => {
    view([blank({ state: "missing" })]);

    expect(screen.getByTestId("homework-alpha@example.com").className).toMatch(
      /bg-danger-surface/,
    );
  });

  it("未定场次说明还得有人指派场次，而不是他没交", () => {
    view([blank({ state: "no_session" })]);

    const row = screen.getByTestId("homework-alpha@example.com");
    expect(within(row).getByText(/先指派场次/)).toBeInTheDocument();
  });
});

describe("筛选", () => {
  const people = [
    person({ studentEmail: "a@example.com", name: "甲", replyStatus: "待回复" }),
    person({ studentEmail: "b@example.com", name: "乙", replyStatus: "已回复" }),
    blank({ studentEmail: "c@example.com", name: "丙", state: "missing" }),
    blank({ studentEmail: "d@example.com", name: "丁", state: "not_open" }),
  ];

  it("四个筛选项各带计数", () => {
    view(people);

    expect(screen.getByRole("button", { name: /全部 4/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /已交 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /未交 1/ })).toBeInTheDocument();
    // 待回复 = 已交且回复状态 ≠「已回复」，所以只有甲
    expect(screen.getByRole("button", { name: /待回复 1/ })).toBeInTheDocument();
  });

  it("未交筛选后只剩未交的人——未开放不算未交", async () => {
    view(people);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /未交 1/ }));

    expect(screen.getByTestId("homework-c@example.com")).toBeInTheDocument();
    expect(screen.queryByTestId("homework-d@example.com")).toBeNull();
  });

  it("待回复筛选排除已回复的人，也排除没交的人", async () => {
    view(people);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /待回复 1/ }));

    expect(screen.getByTestId("homework-a@example.com")).toBeInTheDocument();
    expect(screen.queryByTestId("homework-b@example.com")).toBeNull();
    expect(screen.queryByTestId("homework-c@example.com")).toBeNull();
  });
});

describe("回复状态", () => {
  it("原样显示源文件里的措辞，不改写", () => {
    view([person({ replyStatus: "草稿已创建" })]);

    expect(screen.getAllByText("草稿已创建").length).toBeGreaterThan(0);
    expect(screen.queryByText("草稿待发")).toBeNull();
  });
});

describe("详情面板", () => {
  it("显示总分、本课排名、分项原始分、亮点、改进、回复状态与来源", async () => {
    view([person()]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("homework-alpha@example.com"));

    const panel = within(screen.getByTestId("homework-detail"));
    expect(panel.getByText("77")).toBeInTheDocument();
    expect(panel.getByText(/第 3 \/ 17/)).toBeInTheDocument();
    expect(panel.getByText("A1工作流结构")).toBeInTheDocument();
    expect(panel.getByText("Agent1 提示词详细")).toBeInTheDocument();
    expect(panel.getByText("补中间输出")).toBeInTheDocument();
    expect(panel.getByText("session1/grades.csv:2")).toBeInTheDocument();
  });

  it("0 分的分项照常列出——0 是真实评分，不是缺失", async () => {
    view([person()]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("homework-alpha@example.com"));

    const row = within(screen.getByTestId("homework-detail")).getByTestId(
      "score-A3Cowork特性",
    );
    expect(within(row).getByText("0")).toBeInTheDocument();
  });

  /**
   * 各分项的满分**不在 `grades.csv` 里**（在源仓库的 rubric.md 里，而那两份还是
   * 对调的）。显示 `11 / 15` 需要一个系统拿不到的数，画比例条同理。
   */
  it("不显示满分，也不画按比例的图形", async () => {
    const { container } = view([person()]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("homework-alpha@example.com"));

    const panel = screen.getByTestId("homework-detail");
    expect(panel.textContent).not.toMatch(/11\s*\/\s*\d/);
    expect(container.querySelector("[style*='width']")).toBeNull();
  });

  it("没交的人不显示分数区，而是说明他为什么没有", async () => {
    view([blank({ state: "missing" })]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("homework-alpha@example.com"));

    const panel = within(screen.getByTestId("homework-detail"));
    expect(panel.getByText(/还没交/)).toBeInTheDocument();
    expect(panel.queryByTestId("score-A1工作流结构")).toBeNull();
  });

  it("微信号没对齐时说清楚只能走邮件——催作业要用", async () => {
    view([blank({ state: "missing", wechat: "" })]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("homework-alpha@example.com"));

    expect(
      within(screen.getByTestId("homework-detail")).getByText(/微信.*没对齐/),
    ).toBeInTheDocument();
  });
});

/**
 * 页面只读是有意的：源文件由批改流程生成并由人维护，两边都能写就会分叉。
 * 而「重新同步」按钮更是做不出来——`grades.csv` 在另一个仓库，部署环境的后端
 * 看不到那些文件。
 */
describe("只读", () => {
  it("页面上没有任何修改、删除、新增或同步入口", () => {
    view([person()]);

    expect(
      screen.queryByRole("button", { name: /修改|删除|新增|同步|补录|编辑|保存/ }),
    ).toBeNull();
  });
});

describe("空态", () => {
  it("一门课一个人都没有时给出说明，而不是空表格", () => {
    view([]);

    expect(screen.getByText(/还没有.*报课/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("有人但一份提交都没有时，说明该去哪儿同步", () => {
    view([blank({ state: "missing" })]);

    expect(screen.getByText(/还没有任何提交记录/)).toBeInTheDocument();
  });
});

/**
 * 表格外框上的 `overflow-hidden` 是为了圆角，但它同时是个会被压缩的 flex 子项：
 * 被挤扁之后它**裁掉**超出的行，而外层滚动容器因此看不到任何溢出——
 * 于是哪儿都没有滚动条，够不着的记录就这么消失了。
 *
 * 报课页是 22 条时暴露的，4 条时看着好好的。S1 有 17 行，够撞上。
 * jsdom 没有布局，量不出这些，只能钉住"外框不参与压缩"这个类。
 */
describe("表格不能被裁掉", () => {
  it("表格外框不随 flex 压缩", () => {
    view([person()]);

    const frame = screen.getByTestId("homework-alpha@example.com").closest("table")
      ?.parentElement;
    expect(frame?.className).toContain("flex-none");
  });
});
