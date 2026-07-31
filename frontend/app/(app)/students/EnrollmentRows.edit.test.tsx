import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EnrollmentRows } from "./EnrollmentRows";
import type { Enrollment } from "./types";

const SESSIONS = [
  { id: "s1", label: "2026-07-26 20:30" },
  { id: "s2", label: "2026-07-31 20:30" },
];

function row(over: Partial<Enrollment> = {}): Enrollment {
  return {
    id: "e1",
    studentEmail: "alpha@example.com",
    courseId: "c1",
    courseName: "AI 炒股分析系统",
    sessionId: null,
    sessionDate: null,
    enrolledAt: "2026-06-18",
    state: "enrolled",
    source: "derived",
    note: "",
    ...over,
  };
}

function setup(over: Record<string, unknown> = {}) {
  const props = {
    enrollments: [row()],
    sessionsByCourse: { c1: SESSIONS },
    onAdd: vi.fn(),
    onChangeSession: vi.fn().mockResolvedValue({ ok: true }),
    onDelete: vi.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
  render(<EnrollmentRows {...props} />);
  return props;
}

function firstRow() {
  return within(screen.getByTestId("enrollment-e1"));
}

describe("EnrollmentRows 的逐条编辑", () => {
  it("每条报课都有改场次与删除的入口", () => {
    setup();

    expect(firstRow().getByRole("button", { name: "改场次" })).toBeInTheDocument();
    expect(firstRow().getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  /**
   * 倒推进来的记录全是未定场次；不能改就等于这批数据在界面上无路可走。
   */
  it("能把一条未定场次的报课指派到某一场", async () => {
    const { onChangeSession } = setup();
    const user = userEvent.setup();

    await user.click(firstRow().getByRole("button", { name: "改场次" }));
    await user.selectOptions(firstRow().getByLabelText("场次"), "s2");
    await user.click(firstRow().getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onChangeSession).toHaveBeenCalledWith("e1", "s2"));
  });

  it("能把场次清空回未定", async () => {
    const { onChangeSession } = setup({
      enrollments: [row({ sessionId: "s1", sessionDate: "2026-07-26", state: "completed" })],
    });
    const user = userEvent.setup();

    await user.click(firstRow().getByRole("button", { name: "改场次" }));
    await user.selectOptions(firstRow().getByLabelText("场次"), "");
    await user.click(firstRow().getByRole("button", { name: "保存" }));

    // 空字符串是 select 的"没选"，送到接口上要是 null 而不是空串
    await waitFor(() => expect(onChangeSession).toHaveBeenCalledWith("e1", null));
  });

  it("删除要二次确认", async () => {
    const { onDelete } = setup();
    const user = userEvent.setup();

    await user.click(firstRow().getByRole("button", { name: "删除" }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(firstRow().getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("e1"));
  });

  /**
   * 挂住不 resolve 的 promise 是观察"进行中"的唯一办法——
   * 只断言最终态的测试对这类回归完全盲。
   */
  it("写入进行中，这一条的所有出口都被禁用", async () => {
    setup({ onChangeSession: vi.fn(() => new Promise<{ ok: boolean }>(() => {})) });
    const user = userEvent.setup();

    await user.click(firstRow().getByRole("button", { name: "改场次" }));
    await user.click(firstRow().getByRole("button", { name: "保存" }));

    await waitFor(() => expect(firstRow().getByRole("button", { name: /保存|正在保存/ })).toBeDisabled());
    expect(firstRow().getByRole("button", { name: "取消" })).toBeDisabled();
  });

  /**
   * 几条报课可以各自处于不同状态；共用一处错误显示会让用户不知道是哪一条没存上。
   */
  it("失败说明挂在那一条上，其余条不受影响", async () => {
    setup({
      enrollments: [row(), row({ id: "e2", courseName: "另一门课" })],
      onChangeSession: vi.fn().mockResolvedValue({ ok: false, message: "这一场不属于这门课" }),
    });
    const user = userEvent.setup();

    await user.click(firstRow().getByRole("button", { name: "改场次" }));
    await user.click(firstRow().getByRole("button", { name: "保存" }));

    expect(await firstRow().findByText("这一场不属于这门课")).toBeInTheDocument();
    expect(within(screen.getByTestId("enrollment-e2")).queryByText("这一场不属于这门课")).toBeNull();
  });

  it("失败时编辑态留着，不把用户的选择丢掉", async () => {
    setup({ onChangeSession: vi.fn().mockResolvedValue({ ok: false, message: "没保存上。" }) });
    const user = userEvent.setup();

    await user.click(firstRow().getByRole("button", { name: "改场次" }));
    await user.selectOptions(firstRow().getByLabelText("场次"), "s2");
    await user.click(firstRow().getByRole("button", { name: "保存" }));

    expect(await firstRow().findByText("没保存上。")).toBeInTheDocument();
    expect(firstRow().getByLabelText("场次")).toHaveValue("s2");
  });
});
