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

describe("a session write that fails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the failure next to the session, not inside a closed modal", async () => {
    // 行内编辑时弹窗是关的。把失败信息只渲染在弹窗里，等于保存失败了什么都不说 ——
    // 而调用方已经把 message 返回回来了。
    actions.updateSessionAction.mockResolvedValue({ ok: false, message: "没保存上。" });
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={["讲师甲"]} />);

    await user.click(within(sessionRow("s-done")).getByRole("button", { name: "修正" }));
    await user.click(within(sessionRow("s-done")).getByRole("button", { name: "保存这一场" }));

    await waitFor(() =>
      expect(within(sessionRow("s-done")).getByText("没保存上。")).toBeInTheDocument(),
    );
  });

  it("reports a failed delete instead of looking like it worked", async () => {
    actions.deleteSessionAction.mockResolvedValue({ ok: false, message: "删不掉。" });
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={[]} />);

    await user.click(within(sessionRow("s-done")).getByRole("button", { name: "修正" }));
    await user.click(within(sessionRow("s-done")).getByRole("button", { name: "删除这一场" }));

    await waitFor(() =>
      expect(within(sessionRow("s-done")).getByText("删不掉。")).toBeInTheDocument(),
    );
  });

  it("reports a failed add next to the form that submitted it", async () => {
    actions.addSessionAction.mockResolvedValue({ ok: false, message: "日期不对。" });
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={["讲师甲"]} />);

    await user.click(screen.getByRole("button", { name: "+ 添加上课时间" }));
    await user.type(screen.getByLabelText(/上课日期/), "2026-11-05");
    await user.type(screen.getByLabelText(/时间（美西）/), "19:30");
    await user.click(screen.getByRole("button", { name: "讲师甲" }));
    await user.click(screen.getByRole("button", { name: "添加这一场" }));

    await waitFor(() => expect(screen.getByText("日期不对。")).toBeInTheDocument());
  });
});

describe("the add-session form", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes once the session is added but stays open on failure", async () => {
    actions.addSessionAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={["讲师甲"]} />);

    await user.click(screen.getByRole("button", { name: "+ 添加上课时间" }));
    await user.type(screen.getByLabelText(/上课日期/), "2026-11-05");
    await user.type(screen.getByLabelText(/时间（美西）/), "19:30");
    await user.click(screen.getByRole("button", { name: "讲师甲" }));
    await user.click(screen.getByRole("button", { name: "添加这一场" }));

    // 成功后收起来：新场次会出现在上面的列表里，表单留着只会让人以为没提交成功。
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "添加这一场" })).not.toBeInTheDocument(),
    );
  });
});

describe("writes whose failure must survive the closing UI", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the new-course modal open when the create fails", async () => {
    // 提交即关窗，等于把失败信息连同承载它的界面一起丢掉 ——
    // 场次那边刚修过同一个毛病，课程这边不能留着。
    actions.createCourseAction.mockResolvedValue({ ok: false, message: "建不上。" });
    const user = userEvent.setup();
    render(<CoursesClient courses={[]} teachers={[]} />);

    await user.click(screen.getByRole("button", { name: "新建课程" }));
    await user.type(screen.getByPlaceholderText("如 Claude 实战入门"), "新课");
    await user.click(screen.getByRole("button", { name: "创建课程" }));

    await waitFor(() => expect(screen.getByText("建不上。")).toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // 用户输入还在，不用重打一遍
    expect(screen.getByPlaceholderText("如 Claude 实战入门")).toHaveValue("新课");
  });

  it("closes the new-course modal once the create lands", async () => {
    actions.createCourseAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<CoursesClient courses={[]} teachers={[]} />);

    await user.click(screen.getByRole("button", { name: "新建课程" }));
    await user.type(screen.getByPlaceholderText("如 Claude 实战入门"), "新课");
    await user.click(screen.getByRole("button", { name: "创建课程" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reports a failed 恢复跟随日期 on the row", async () => {
    actions.followDateAction.mockResolvedValue({ ok: false, message: "改不回去。" });
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
      expect(within(sessionRow("s-done")).getByText("改不回去。")).toBeInTheDocument(),
    );
  });
});

describe("guards while a write is in flight", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not let 取消 close the modal mid-save", async () => {
    // 保存中点取消，弹窗一走，随后回来的失败信息就没有地方渲染 ——
    // 与"提交即关窗"是同一个失败，只是从另一个出口漏出来。
    actions.createCourseAction.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<CoursesClient courses={[]} teachers={[]} />);

    await user.click(screen.getByRole("button", { name: "新建课程" }));
    await user.type(screen.getByPlaceholderText("如 Claude 实战入门"), "新课");
    await user.click(screen.getByRole("button", { name: "创建课程" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toBeDisabled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disables the alias buttons while a write is pending", async () => {
    // busy 是全页共享的：连点「添加别名」会把同一个别名发两遍，
    // 第二次撞主键。session 那边刚补过这层，别名这边漏了。
    actions.addAliasAction.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={[]} />);
    await openEditor();

    await user.type(screen.getByPlaceholderText("平台里的另一种写法"), "S2");
    await user.click(screen.getByRole("button", { name: "添加别名" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "添加别名" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "删除别名 S1" })).toBeDisabled();
  });

  it("keeps the alias draft when the add fails", async () => {
    actions.addAliasAction.mockResolvedValue({ ok: false, message: "别名被占了。" });
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={[]} />);
    await openEditor();

    await user.type(screen.getByPlaceholderText("平台里的另一种写法"), "S2");
    await user.click(screen.getByRole("button", { name: "添加别名" }));

    await waitFor(() => expect(screen.getByText("别名被占了。")).toBeInTheDocument());
    // 失败就把用户刚敲的清掉，和课程表单那边的做法自相矛盾
    expect(screen.getByPlaceholderText("平台里的另一种写法")).toHaveValue("S2");
  });

  it("keeps an edit-course failure on screen too", async () => {
    actions.updateCourseAction.mockResolvedValue({ ok: false, message: "改不上。" });
    const user = userEvent.setup();
    render(<CoursesClient courses={[course]} teachers={[]} />);
    await openEditor();

    await user.click(screen.getByRole("button", { name: "保存课程" }));

    await waitFor(() => expect(screen.getByText("改不上。")).toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
