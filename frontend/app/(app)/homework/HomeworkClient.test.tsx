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
const previewReport = vi.fn();
const applyReport = vi.fn();
vi.mock("./actions", () => ({
  previewImport: vi.fn(),
  applyImport: vi.fn(),
  excludeEmailAction: vi.fn(),
  markReplied: (...args: unknown[]) => markReplied(...args),
  markUnreplied: (...args: unknown[]) => markUnreplied(...args),
  previewReport: (...args: unknown[]) => previewReport(...args),
  applyReport: (...args: unknown[]) => applyReport(...args),
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
      { item: "A1工作流结构", score: 11, max: null },
      { item: "A3Cowork特性", score: 0, max: null },
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
    totalMax: null,
    dimensionComments: [],
    highlightLocked: false,
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
  initialSelectedEmail: string | null = null,
) {
  return render(
    <HomeworkClient
      courses={COURSES}
      courseId={courseId}
      people={people}
      lastImport={lastImport}
      initialSelectedEmail={initialSelectedEmail}
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
  it("未标记时原样显示源文件里的措辞，不改写", () => {
    view([person({ replyStatus: "草稿已创建", replied: false })]);

    expect(screen.getAllByText("草稿已创建").length).toBeGreaterThan(0);
    expect(screen.queryByText("草稿待发")).toBeNull();
  });

  /**
   * 讲师标记比源文件那列更可信——那一列每次导入整列覆盖，常常没跟上
   * 讲师实际的回复动作。名单表格因此**以标记为准**：标记了就显示「已回复」，
   * 不管源文件当时写的是什么；没标记才退回显示源文件原文（详情面板里
   * 两者依然分开展示，这里只改名单表格这一列）。
   */
  it("已标记时名单表格显示「已回复」，不再显示源文件原文", () => {
    view([person({ replyStatus: "待回复", replied: true })]);

    const row = screen.getByTestId("homework-alpha@example.com");
    expect(within(row).getByText("已回复")).toBeInTheDocument();
    expect(within(row).queryByText("待回复")).toBeNull();
  });
});

describe("详情面板", () => {
  it("显示总分、本课排名、分项原始分、亮点、改进与来源", async () => {
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

describe("批改报告上传", () => {
  beforeEach(() => {
    previewReport.mockReset().mockResolvedValue({
      ok: true,
      result: {
        items: [{ code: "A1", score: 13, max: 15, comment: "分工清晰。", mismatch: false }],
        highlight: "报告亮点",
        improve: "报告改进建议",
        totalMismatch: false,
      },
    });
    applyReport.mockReset().mockResolvedValue({
      ok: true,
      result: {
        items: [],
        highlight: "报告亮点",
        improve: "报告改进建议",
        totalMismatch: false,
      },
    });
  });

  it("详情面板显示「上传批改报告」按钮", async () => {
    view([person()]);
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    expect(
      within(screen.getByTestId("homework-detail")).getByText("上传批改报告"),
    ).toBeInTheDocument();
  });

  it("没有提交的人不显示上传入口——无从上传", async () => {
    view([blank({ state: "missing" })]);
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    expect(
      within(screen.getByTestId("homework-detail")).queryByText("上传批改报告"),
    ).toBeNull();
  });

  it("选中文件后打开预览对话框，展示解析出的分项评语", async () => {
    view([person()]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("homework-alpha@example.com"));

    const input = within(screen.getByTestId("homework-detail")).getByLabelText(
      "上传批改报告",
      { selector: "input" },
    );
    await user.upload(input, new File([new Uint8Array([1])], "report.md"));

    expect(await screen.findByRole("dialog", { name: "上传批改报告" })).toBeInTheDocument();
    expect(screen.getByText("分工清晰。")).toBeInTheDocument();
  });

  it("分项评语合并进「分项」块——按编号前缀对应到对应分项行下面，不再单独成块", async () => {
    view([
      person({
        scores: [{ item: "A1工作流结构", score: 13, max: 15 }],
        dimensionComments: [{ item: "A1", comment: "报告评语。" }],
        highlightLocked: true,
      }),
    ]);
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    const panel = within(screen.getByTestId("homework-detail"));
    // 挂在对应分项行下面，不是独立的一块。
    const scoreRow = panel.getByTestId("score-A1工作流结构");
    expect(within(scoreRow).getByText("报告评语。")).toBeInTheDocument();
    expect(panel.queryByText("逐分项评语")).toBeNull();
    expect(panel.getAllByText("来自批改报告").length).toBeGreaterThan(0);
  });

  it("未导入过报告时不显示分项评语文字与来源徽章", async () => {
    view([person({ dimensionComments: [], highlightLocked: false })]);
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    const panel = within(screen.getByTestId("homework-detail"));
    expect(panel.queryByText("逐分项评语")).toBeNull();
    expect(panel.queryByText("来自批改报告")).toBeNull();
  });
});

describe("详情面板：回复状态字段已去掉", () => {
  it("不再显示单独的「回复状态」字段——讲师标记区已经是更可信的信号", async () => {
    view([person({ replyStatus: "草稿已创建" })]);
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    const panel = within(screen.getByTestId("homework-detail"));
    expect(panel.queryByText("回复状态")).toBeNull();
  });
});

describe("深链接自动选中学员", () => {
  it("initialSelectedEmail 命中名单里的人时，详情面板加载即展开", () => {
    view([person({ studentEmail: "alpha@example.com" })], "c1", null, "alpha@example.com");

    expect(screen.getByTestId("homework-detail")).toBeInTheDocument();
  });

  it("initialSelectedEmail 不在当前课程名单里时，不自动展开，也不报错", () => {
    view([person({ studentEmail: "alpha@example.com" })], "c1", null, "nobody@example.com");

    expect(screen.queryByTestId("homework-detail")).toBeNull();
  });

  it("不传 initialSelectedEmail 时行为不变——不自动展开", () => {
    view([person({ studentEmail: "alpha@example.com" })]);

    expect(screen.queryByTestId("homework-detail")).toBeNull();
  });

  /**
   * `useState` 的初始值只在挂载那一刻生效。Next.js 在同一个 `/homework` 路由内
   * 切换 `?student=` 走客户端过渡，`HomeworkClient` 不会重新挂载——如果只靠
   * `useState(initialSelectedEmail)`，第二次点击不同学员的深链接会显示上一个人。
   */
  it("initialSelectedEmail 换成另一个值时（同一实例重渲染），详情面板跟着切换", () => {
    const people = [
      person({ studentEmail: "alpha@example.com", name: "甲" }),
      person({ studentEmail: "bravo@example.com", name: "乙" }),
    ];
    const { rerender } = render(
      <HomeworkClient
        courses={COURSES}
        courseId="c1"
        people={people}
        lastImport={null}
        initialSelectedEmail="alpha@example.com"
      />,
    );
    expect(within(screen.getByTestId("homework-detail")).getByText("甲")).toBeInTheDocument();

    rerender(
      <HomeworkClient
        courses={COURSES}
        courseId="c1"
        people={people}
        lastImport={null}
        initialSelectedEmail="bravo@example.com"
      />,
    );

    expect(within(screen.getByTestId("homework-detail")).getByText("乙")).toBeInTheDocument();
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

describe("分项满分：X / 满分 + 条形图三档染色", () => {
  it("配了满分时显示比例并按≥90%染成绿色", async () => {
    view([
      person({
        scores: [{ item: "A1", score: 48, max: 50 }],
      }),
    ]);
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    expect(screen.getByTestId("score-text-A1")).toHaveTextContent("48 / 50");
    expect(screen.getByTestId("score-text-A1").className).toContain("text-success");
    expect(screen.getByTestId("score-bar-A1").className).toContain("bg-success");
  });

  it("70%-90% 之间染成黄色", async () => {
    view([person({ scores: [{ item: "A1", score: 39, max: 50 }] })]); // 78%
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    expect(screen.getByTestId("score-text-A1").className).toContain("text-warning");
    expect(screen.getByTestId("score-bar-A1").className).toContain("bg-warning");
  });

  it("低于 70% 染成红色", async () => {
    view([person({ scores: [{ item: "A1", score: 27, max: 50 }] })]); // 54%
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    expect(screen.getByTestId("score-text-A1").className).toContain("text-danger");
    expect(screen.getByTestId("score-bar-A1").className).toContain("bg-danger");
  });

  it("没有配满分时只显示原始分，不渲染条形图", async () => {
    view([person({ scores: [{ item: "A1", score: 35, max: null }] })]);
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    expect(screen.getByTestId("score-text-A1")).toHaveTextContent("35");
    expect(screen.queryByTestId("score-bar-A1")).toBeNull();
  });
});

describe("总分进度条：仅在该提交全部分项都配了满分时出现", () => {
  it("全部配齐时显示按比例进度条与对应颜色", async () => {
    view([
      person({
        total: 96,
        totalMax: 100,
        scores: [
          { item: "A1", score: 48, max: 50 },
          { item: "D2", score: 48, max: 50 },
        ],
      }),
    ]);
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    const bar = screen.getByTestId("total-progress-fill");
    expect(bar.className).toContain("bg-success");
    expect(bar.style.width).toBe("96%");
  });

  it("有分项未配满分时，总分只显示数字，不渲染进度条", async () => {
    view([
      person({
        total: 73,
        totalMax: null,
        scores: [
          { item: "A1", score: 38, max: 50 },
          { item: "D2", score: 35, max: null },
        ],
      }),
    ]);
    await userEvent.setup().click(screen.getByTestId("homework-alpha@example.com"));

    expect(screen.getAllByText("73").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("total-progress-fill")).toBeNull();
  });
});

describe("名单表格：迷你竖条", () => {
  it("配了满分的分项渲染出按比例染色的竖条", () => {
    view([
      person({
        scores: [
          { item: "A1", score: 48, max: 50 },
          { item: "D2", score: 48, max: 50 },
        ],
      }),
    ]);

    const spark = screen.getByTestId("sparkline-alpha@example.com");
    const bars = within(spark).getAllByTestId(/^spark-bar-/);
    expect(bars).toHaveLength(2);
    expect(bars[0].className).toContain("bg-success");
  });

  it("没配满分的分项不产生竖条", () => {
    view([
      person({
        scores: [
          { item: "A1", score: 48, max: 50 },
          { item: "D2", score: 35, max: null },
        ],
      }),
    ]);

    const spark = screen.getByTestId("sparkline-alpha@example.com");
    const bars = within(spark).getAllByTestId(/^spark-bar-/);
    expect(bars).toHaveLength(1);
  });
});
