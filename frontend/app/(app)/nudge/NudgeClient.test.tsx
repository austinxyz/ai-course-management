import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NudgeClient } from "./NudgeClient";
import type { NudgeCourse, NudgePerson } from "./types";

vi.mock("next/navigation", () => ({ usePathname: () => "/nudge" }));

const markNudged = vi.fn();
const skipNudge = vi.fn();
vi.mock("./actions", () => ({
  markNudged: (...args: unknown[]) => markNudged(...args),
  skipNudge: (...args: unknown[]) => skipNudge(...args),
}));

const COURSES: NudgeCourse[] = [
  { id: "c1", name: "从零开始用 Claude 和 Cowork" },
  { id: "c2", name: "先造枪：建知识库" },
];

function person(over: Partial<NudgePerson> = {}): NudgePerson {
  return {
    studentEmail: "alpha@example.com",
    name: "学员甲",
    wechat: "曲素会",
    courseId: "c1",
    overdueDays: 9,
    history: [],
    ...over,
  };
}

function view(people: NudgePerson[], courseId = "c1", skippedCount = 0) {
  return render(
    <NudgeClient courses={COURSES} courseId={courseId} people={people} skippedCount={skippedCount} />,
  );
}

describe("名单", () => {
  it("显示课程 tab 与名单行（姓名/逾期天数）", () => {
    view([person()]);

    expect(screen.getByRole("link", { name: /从零开始用 Claude 和 Cowork/ })).toBeInTheDocument();
    expect(screen.getByText("学员甲")).toBeInTheDocument();
    expect(screen.getByText(/9 天/)).toBeInTheDocument();
  });

  it("微信未对齐的人标「未对齐微信」", () => {
    view([person({ wechat: "" })]);

    expect(screen.getByText("未对齐微信")).toBeInTheDocument();
  });

  it("没有人未交时给出说明", () => {
    view([]);

    expect(screen.getByText(/都交了|没有.*未交/)).toBeInTheDocument();
  });
});

describe("详情面板", () => {
  it("点一行展开详情，草稿套姓名/课程/逾期天数", async () => {
    view([person()]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    const panel = within(screen.getByTestId("nudge-detail"));
    const draft = panel.getByRole("textbox") as HTMLTextAreaElement;
    expect(draft.value).toContain("学员甲");
    expect(draft.value).toContain("从零开始用 Claude 和 Cowork");
    expect(draft.value).toContain("9");
  });

  it("有催促历史时按时间倒序展示", async () => {
    view([
      person({
        history: [
          { type: "nudged", channel: "email", note: "", at: "2026-08-01T00:00:00Z" },
          { type: "nudged", channel: "email", note: "", at: "2026-07-28T00:00:00Z" },
        ],
      }),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    const rows = within(screen.getByTestId("nudge-detail")).getAllByTestId(/^history-/);
    expect(rows).toHaveLength(2);
    // 服务端已经按时间倒序排好，组件不重新排序——第一条对应更晚的 at。
    expect(rows[0]).toHaveAttribute("data-testid", "history-2026-08-01T00:00:00Z");
  });

  it("没有催促历史时显示「还没催过这个人」", async () => {
    view([person({ history: [] })]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    expect(
      within(screen.getByTestId("nudge-detail")).getByText("还没催过这个人。"),
    ).toBeInTheDocument();
  });
});

describe("头部统计与进度指示", () => {
  it("同时显示未交人数与已跳过人数", () => {
    view([person(), person({ studentEmail: "bravo@example.com" })], "c1", 3);

    expect(screen.getByText(/2 人未交/)).toBeInTheDocument();
    expect(screen.getByText(/已跳过 3 人/)).toBeInTheDocument();
  });

  it("没有人被跳过时显示已跳过 0 人，不是隐藏这一项", () => {
    view([person()], "c1", 0);

    expect(screen.getByText(/已跳过 0 人/)).toBeInTheDocument();
  });

  it("头部只显示 3 步进度指示，不出现发送邮件", () => {
    view([person()]);

    expect(screen.getByText("算名单")).toBeInTheDocument();
    expect(screen.getByText("起草文案")).toBeInTheDocument();
    expect(screen.getByText(/标记.*跳过/)).toBeInTheDocument();
    expect(screen.queryByText("发送邮件")).not.toBeInTheDocument();
  });
});

describe("导出名单", () => {
  it("点击导出名单不发起网络请求，触发下载", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const createObjectURL = vi.fn().mockReturnValue("blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...globalThis.URL, createObjectURL, revokeObjectURL });

    view([person()]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "导出名单" }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("文案模板 tab", () => {
  it("已催 0 次默认选中第一次提醒", async () => {
    view([person({ history: [] })]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    const panel = within(screen.getByTestId("nudge-detail"));
    expect(panel.getByRole("tab", { name: "第一次提醒", selected: true })).toBeInTheDocument();
  });

  it("已催 1 次默认选中第二次提醒", async () => {
    view([
      person({
        history: [{ type: "nudged", channel: "email", note: "", at: "2026-08-01T00:00:00Z" }],
      }),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    const panel = within(screen.getByTestId("nudge-detail"));
    expect(panel.getByRole("tab", { name: "第二次提醒", selected: true })).toBeInTheDocument();
  });

  it("已催 2 次及以上默认选中最后一次", async () => {
    view([
      person({
        history: [
          { type: "nudged", channel: "email", note: "", at: "2026-08-01T00:00:00Z" },
          { type: "nudged", channel: "email", note: "", at: "2026-07-28T00:00:00Z" },
        ],
      }),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    const panel = within(screen.getByTestId("nudge-detail"));
    expect(panel.getByRole("tab", { name: "最后一次", selected: true })).toBeInTheDocument();
  });

  it("手动点击另一档且草稿未编辑过时，草稿替换为新档位默认文案", async () => {
    view([person({ history: [] })]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    const panel = within(screen.getByTestId("nudge-detail"));
    const draftBefore = (panel.getByRole("textbox") as HTMLTextAreaElement).value;
    await user.click(panel.getByRole("tab", { name: "最后一次" }));

    const draftAfter = (panel.getByRole("textbox") as HTMLTextAreaElement).value;
    expect(draftAfter).not.toBe(draftBefore);
    expect(panel.getByRole("tab", { name: "最后一次", selected: true })).toBeInTheDocument();
  });

  it("草稿已编辑过时，点击另一档不覆盖草稿", async () => {
    view([person({ history: [] })]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    const panel = within(screen.getByTestId("nudge-detail"));
    const draft = panel.getByRole("textbox") as HTMLTextAreaElement;
    await user.clear(draft);
    await user.type(draft, "我手写的内容");

    await user.click(panel.getByRole("tab", { name: "最后一次" }));

    expect(draft.value).toBe("我手写的内容");
  });
});

describe("写入动作", () => {
  beforeEach(() => {
    markNudged.mockReset().mockResolvedValue({ ok: true });
    skipNudge.mockReset().mockResolvedValue({ ok: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("点「标记已催」调用 markNudged，带学员邮箱与课程 id", async () => {
    view([person()]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    await user.click(
      within(screen.getByTestId("nudge-detail")).getByRole("button", { name: "标记已催" }),
    );

    expect(markNudged).toHaveBeenCalledWith("alpha@example.com", "c1");
  });

  it("点「跳过」调用 skipNudge", async () => {
    view([person()]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    await user.click(
      within(screen.getByTestId("nudge-detail")).getByRole("button", { name: "跳过" }),
    );

    expect(skipNudge).toHaveBeenCalledWith("alpha@example.com", "c1");
  });

  it("编辑草稿后选中另一人、再选回来，草稿恢复成默认文本", async () => {
    view([
      person({ studentEmail: "alpha@example.com", name: "甲" }),
      person({ studentEmail: "bravo@example.com", name: "乙" }),
    ]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("nudge-alpha@example.com"));
    const draft = within(screen.getByTestId("nudge-detail")).getByRole(
      "textbox",
    ) as HTMLTextAreaElement;
    await user.clear(draft);
    await user.type(draft, "手写的内容");
    expect(draft.value).toBe("手写的内容");

    await user.click(screen.getByTestId("nudge-bravo@example.com"));
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    const reopened = within(screen.getByTestId("nudge-detail")).getByRole(
      "textbox",
    ) as HTMLTextAreaElement;
    expect(reopened.value).not.toBe("手写的内容");
    expect(reopened.value).toContain("甲");
  });

  it("点「复制文案」不触发任何网络请求", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    view([person()]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("nudge-alpha@example.com"));

    await user.click(
      within(screen.getByTestId("nudge-detail")).getByRole("button", { name: "复制文案" }),
    );

    // 复制走浏览器剪贴板 API，不经过 Server Action / fetch。
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(markNudged).not.toHaveBeenCalled();
    expect(skipNudge).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
