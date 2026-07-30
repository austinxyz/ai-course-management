import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CoursesClient } from "./CoursesClient";
import type { Course } from "./types";

const actions = vi.hoisted(() => ({
  createCourseAction: vi.fn(),
  updateCourseAction: vi.fn(),
  addAliasAction: vi.fn(),
  removeAliasAction: vi.fn(),
  addSessionAction: vi.fn(),
  updateSessionAction: vi.fn(),
  followDateAction: vi.fn(),
  deleteSessionAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

const done: Course["sessions"][number] = {
  id: "s-done",
  local_date: "2026-01-15",
  local_time: "19:30:00",
  tz: "America/Los_Angeles",
  teacher: "讲师甲",
  note: "",
  starts_at: "2026-01-16T03:30:00+00:00",
  state: "done",
  state_is_override: false,
};

const course: Course = {
  id: "c-1",
  name: "Claude 实战入门",
  short: "入门",
  tagline: "定位",
  intro: "介绍",
  hours: 2,
  homework_title: "作业题目",
  offline: false,
  aliases: [{ raw: "S1" }],
  sessions: [done],
};

function openEditor() {
  return userEvent.setup().click(screen.getByRole("button", { name: "编辑课程" }));
}

describe("creating a course", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.createCourseAction.mockResolvedValue({ ok: true });
  });

  it("needs only a name", async () => {
    const user = userEvent.setup();
    render(<CoursesClient courses={[]} teachers={[]} />);

    await user.click(screen.getByRole("button", { name: "新建课程" }));
    await user.type(screen.getByPlaceholderText("如 Claude 实战入门"), "新课");
    await user.click(screen.getByRole("button", { name: "创建课程" }));

    await waitFor(() =>
      expect(actions.createCourseAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: "新课" }),
      ),
    );
  });

  it("refuses to submit a blank name", async () => {
    const user = userEvent.setup();
    render(<CoursesClient courses={[]} teachers={[]} />);

    await user.click(screen.getByRole("button", { name: "新建课程" }));
    await user.click(screen.getByRole("button", { name: "创建课程" }));

    expect(actions.createCourseAction).not.toHaveBeenCalled();
    expect(screen.getByText("课程名不能为空")).toBeInTheDocument();
  });
});

describe("editing a course", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.updateCourseAction.mockResolvedValue({ ok: true });
    actions.addAliasAction.mockResolvedValue({ ok: true });
  });

  it("says up front that renaming needs the aliases updated too", async () => {
    // 改了名字而别名没跟着改，下次导入就静默匹配不上——那时错误离这次编辑已经很远。
    // 所以提示是编辑态的常驻说明，不等用户改完才出现（设计里也是这个位置）。
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={[]} />);
    await openEditor();

    expect(
      screen.getAllByText("课程名改了要同步平台别名，否则下次导入会匹配不上。"),
    ).toHaveLength(1);

    const nameField = screen.getByPlaceholderText("如 Claude 实战入门");
    await user.clear(nameField);
    await user.type(nameField, "改了名字的课");

    // 提示而已，别名本身不动 —— 平台里写的是什么只有讲师知道。
    expect(actions.removeAliasAction).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByText("S1")).toBeInTheDocument();
  });

  it("surfaces an occupied alias as a returned result, not a thrown error", async () => {
    // 生产构建会把 Server Action 抛出的错误抹成 digest，客户端拿不到内容——
    // 所以"别名被占用"必须是返回值。这条测试盯的就是那条路径。
    actions.addAliasAction.mockResolvedValue({
      ok: false,
      message: "别名 S1 已属于课程「往期课程」",
    });
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={[]} />);
    await openEditor();

    await user.type(screen.getByPlaceholderText("平台里的另一种写法"), "S1");
    await user.click(screen.getByRole("button", { name: "添加别名" }));

    await waitFor(() =>
      expect(screen.getByText("别名 S1 已属于课程「往期课程」")).toBeInTheDocument(),
    );
  });
});

describe("scheduling sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.addSessionAction.mockResolvedValue({ ok: true });
    actions.updateSessionAction.mockResolvedValue({ ok: true });
  });

  it("warns before editing a session that already happened", async () => {
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={[]} />);

    await user.click(within(sessionRow("s-done")).getByRole("button", { name: "修正" }));

    expect(
      screen.getByText(
        "这一场已经上过，改动会影响历史记录和作业统计，只在修正错误时改。",
      ),
    ).toBeInTheDocument();
  });

  it("offers the teachers seen so far and takes a new one", async () => {
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={["讲师甲", "讲师乙"]} />);

    await user.click(screen.getByRole("button", { name: "+ 添加上课时间" }));

    expect(screen.getByRole("button", { name: "讲师乙" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ 新讲师" }));
    expect(screen.getByPlaceholderText("讲师姓名")).toBeInTheDocument();
  });

  it("sends a new session with the wall time as typed", async () => {
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={["讲师甲"]} />);

    await user.click(screen.getByRole("button", { name: "+ 添加上课时间" }));
    await user.type(screen.getByLabelText(/上课日期/), "2026-11-05");
    await user.type(screen.getByLabelText(/时间（美西）/), "19:30");
    await user.click(screen.getByRole("button", { name: "讲师甲" }));
    await user.click(screen.getByRole("button", { name: "添加这一场" }));

    await waitFor(() =>
      expect(actions.addSessionAction).toHaveBeenCalledWith(
        course.id,
        expect.objectContaining({
          local_date: "2026-11-05",
          local_time: "19:30",
          teacher: "讲师甲",
        }),
      ),
    );
  });

  it("releases a manual state back to following the date", async () => {
    actions.followDateAction.mockResolvedValue({ ok: true });
    const overridden = {
      ...course,
      sessions: [{ ...done, state: "cancelled" as const, state_is_override: true }],
    };
    const user = userEvent.setup();
    render(<CoursesClient courses={[overridden]} teachers={[]} />);

    await user.click(
      within(sessionRow("s-done")).getByRole("button", { name: "恢复跟随日期" }),
    );

    await waitFor(() =>
      expect(actions.followDateAction).toHaveBeenCalledWith(course.id, "s-done"),
    );
  });
});

function sessionRow(id: string): HTMLElement {
  return document.querySelector(`[data-session="${id}"]`) as HTMLElement;
}
