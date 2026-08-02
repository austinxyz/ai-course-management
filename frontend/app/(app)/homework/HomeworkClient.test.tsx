import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeworkClient } from "./HomeworkClient";
import type { HomeworkCourse, HomeworkPerson, LastImport } from "./types";

vi.mock("next/navigation", () => ({ usePathname: () => "/homework" }));

// 标记按钮直接调用 "./actions" 里的 Server Action——真的调用会撞
// `next/headers`（vitest 环境下不可用），所以整个模块换成替身。
// `applyImport`/`previewImport`/`excludeEmailAction` 现有测试从不触发，
// 留空实现即可。
const markReplied = vi.fn();
const markUnreplied = vi.fn();
vi.mock("./actions", () => ({
  previewImport: vi.fn(),
  applyImport: vi.fn(),
  excludeEmailAction: vi.fn(),
  markReplied: (...args: unknown[]) => markReplied(...args),
  markUnreplied: (...args: unknown[]) => markUnreplied(...args),
}));

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
    submissionId: "sub-alpha",
    replied: false,
    repliedAt: null,
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
    submissionId: null,
    ...over,
  });
}

function view(
  people: HomeworkPerson[],
  courseId = "c1",
  lastImport: LastImport | null = null,
) {
  return render(
    <HomeworkClient
      courses={COURSES}
      courseId={courseId}
      people={people}
      lastImport={lastImport}
    />,
  );
}

describe("按课程组织", () => {
  /**
   * chip 上写课程名，不写简称。
   *
   * `S3` / `S4` 这样的简称只在讲师脑子里对得上课程，而报课页一直显示的是
   * 课程名——同一件东西在两页两个叫法，切页面时要重新认一遍。
   * 名字长会换行，那是可以接受的代价（报课页已经如此）。
   */
  it("chip 上是课程名，不是简称", () => {
    view([person()]);

    const s2 = screen.getByRole("link", { name: "先造枪：建知识库" });
    expect(s2).toHaveAttribute("href", "/homework?course=c2");
    expect(screen.queryByRole("link", { name: "S2" })).toBeNull();
  });

  it("标题旁显示名单人数，不重复课程名——那已经在高亮的 chip 上了", () => {
    view([person(), blank({ studentEmail: "b@example.com", name: "乙" })]);

    const header = screen.getByRole("heading", { name: "作业" }).parentElement;
    expect(header?.textContent).toMatch(/2 人/);
  });

  it("当前课程高亮", () => {
    view([person()]);

    expect(
      screen.getByRole("link", { name: "从零开始用 Claude 和 Cowork" }).className,
    ).toMatch(/bg-primary/);
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
    person({ studentEmail: "a@example.com", name: "甲", replied: false }),
    person({ studentEmail: "b@example.com", name: "乙", replied: true }),
    blank({ studentEmail: "c@example.com", name: "丙", state: "missing" }),
    blank({ studentEmail: "d@example.com", name: "丁", state: "not_open" }),
  ];

  it("四个筛选项各带计数", () => {
    view(people);

    expect(screen.getByRole("button", { name: /全部 4/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /已交 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /未交 1/ })).toBeInTheDocument();
    // 待回复 = 已交且**讲师未标记为已回复**，所以只有甲
    expect(screen.getByRole("button", { name: /待回复 1/ })).toBeInTheDocument();
  });

  it("未交筛选后只剩未交的人——未开放不算未交", async () => {
    view(people);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /未交 1/ }));

    expect(screen.getByTestId("homework-c@example.com")).toBeInTheDocument();
    expect(screen.queryByTestId("homework-d@example.com")).toBeNull();
  });

  it("待回复筛选排除已标记的人，也排除没交的人", async () => {
    view(people);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /待回复 1/ }));

    expect(screen.getByTestId("homework-a@example.com")).toBeInTheDocument();
    expect(screen.queryByTestId("homework-b@example.com")).toBeNull();
    expect(screen.queryByTestId("homework-c@example.com")).toBeNull();
  });

  it("待回复判据看讲师标记，不看源文件的回复状态", async () => {
    // reply_status 依然是「已回复」，但讲师没有标记——仍然待回复。
    view([
      person({
        studentEmail: "a@example.com",
        replyStatus: "已回复",
        replied: false,
      }),
    ]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /待回复 1/ }));

    expect(screen.getByTestId("homework-a@example.com")).toBeInTheDocument();
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

describe("讲师标记已回复", () => {
  beforeEach(() => {
    markReplied.mockReset().mockResolvedValue({ ok: true, replied: true, repliedAt: "2026-08-02T14:20:00Z" });
    markUnreplied.mockReset().mockResolvedValue({ ok: true, replied: false, repliedAt: null });
  });

  it("未标记时显示「标记已回复」按钮，不显示徽章", async () => {
    view([person({ replied: false })]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("homework-alpha@example.com"));

    const panel = within(screen.getByTestId("homework-detail"));
    expect(panel.getByRole("button", { name: "标记已回复" })).toBeInTheDocument();
    expect(panel.queryByTestId("replied-badge")).toBeNull();
  });

  it("已标记时显示徽章与时间戳，按钮变成「标记未回复」", async () => {
    view([person({ replied: true, repliedAt: "2026-08-02T14:20:00Z" })]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("homework-alpha@example.com"));

    const panel = within(screen.getByTestId("homework-detail"));
    expect(panel.getByTestId("replied-badge")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "标记未回复" })).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: "标记已回复" })).toBeNull();
  });

  it("点「标记已回复」调用 markReplied，带上这条提交的 id", async () => {
    view([person({ submissionId: "sub-alpha", replied: false })]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("homework-alpha@example.com"));

    await user.click(
      within(screen.getByTestId("homework-detail")).getByRole("button", {
        name: "标记已回复",
      }),
    );

    expect(markReplied).toHaveBeenCalledWith("sub-alpha");
  });

  it("点「标记未回复」调用 markUnreplied", async () => {
    view([person({ submissionId: "sub-alpha", replied: true, repliedAt: "2026-08-02T14:20:00Z" })]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("homework-alpha@example.com"));

    await user.click(
      within(screen.getByTestId("homework-detail")).getByRole("button", {
        name: "标记未回复",
      }),
    );

    expect(markUnreplied).toHaveBeenCalledWith("sub-alpha");
  });

  it("没有提交的人不显示标记控件——无从标记", async () => {
    view([blank({ state: "missing" })]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("homework-alpha@example.com"));

    const panel = within(screen.getByTestId("homework-detail"));
    expect(panel.queryByRole("button", { name: /标记/ })).toBeNull();
  });

  it("标记失败时就地显示错误", async () => {
    markReplied.mockResolvedValue({ ok: false, message: "标记没能保存，请重试。" });
    view([person({ replied: false })]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("homework-alpha@example.com"));

    await user.click(
      within(screen.getByTestId("homework-detail")).getByRole("button", {
        name: "标记已回复",
      }),
    );

    expect(
      await within(screen.getByTestId("homework-detail")).findByText(/标记没能保存/),
    ).toBeInTheDocument();
  });
});

/**
 * 成绩本身仍然不可逐条编辑：源文件由批改流程生成并由人维护，
 * 两边都能改单条就会分叉，而分叉之后没有哪一边有资格当准。
 *
 * 页面上唯一的写入口是**整份文件导入**——它的语义是"以这份文件为准"，
 * 不产生分叉。原来那条"连导入也做不出来"的理由（源文件在另一个仓库、
 * 部署环境的后端看不到）只证明了后端读不到文件系统，
 * 而浏览器上传恰恰绕开了这一点。
 */
describe("只读", () => {
  it("页面上没有逐条修改、删除、新增成绩的入口", () => {
    view([person()]);

    expect(
      screen.queryByRole("button", { name: /修改|删除|新增|补录|编辑|保存/ }),
    ).toBeNull();
  });
});

describe("导入入口", () => {
  it("有「导入 grades.csv」入口", () => {
    view([person()]);

    expect(screen.getByLabelText(/导入 grades\.csv/)).toBeInTheDocument();
  });

  it("显示上次导入的时间、文件名与行数", () => {
    view([person()], "c1", {
      filename: "session1/grades.csv",
      encoding: "utf-8",
      rowCount: 17,
      createdCount: 16,
      updatedCount: 1,
      importedAt: "2026-07-31T22:47:00Z",
    });

    const line = screen.getByTestId("last-import");
    expect(within(line).getByText(/session1\/grades\.csv/)).toBeInTheDocument();
    expect(within(line).getByText(/17 行/)).toBeInTheDocument();
  });

  it("还没导过时不显示那一行——「还没有」不是错误，不该占一行说空话", () => {
    view([person()], "c1", null);

    expect(screen.queryByTestId("last-import")).toBeNull();
  });

  it("没有课程选择控件——课程恒为当前选中的那一门", () => {
    view([person()]);

    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("不再提 tools/homework-sync —— 那个工具已经删了", () => {
    // 留着的话，页面在教用户去跑一个不存在的脚本。
    view([blank({ state: "missing" })]);

    expect(screen.queryByText(/homework-sync/)).toBeNull();
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
