import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EnrollmentModal } from "./EnrollmentModal";

const COURSES = [
  { id: "c1", name: "AI 炒股分析系统", offline: false, sessions: [{ id: "s1", label: "2026-07-26 20:30" }] },
  { id: "c2", name: "已经不招了", offline: true, sessions: [] },
];

function setup(over: Partial<Parameters<typeof EnrollmentModal>[0]> = {}) {
  // 返回**实际用上的**那两个 mock：先展开覆盖再取回，否则调用方拿到的是被
  // 覆盖掉的那个内部 mock，断言就查在了一个从没被调用过的对象上。
  const props = {
    studentName: "学员甲",
    courses: COURSES,
    today: "2026-07-30",
    onSave: vi.fn().mockResolvedValue({ ok: true }),
    onClose: vi.fn(),
    ...over,
  };
  render(<EnrollmentModal {...props} />);
  return { onSave: props.onSave, onClose: props.onClose };
}

describe("EnrollmentModal", () => {
  /**
   * The form collects four things; a create path that only forwards the
   * required two loses the rest silently — the backend has defaults for them,
   * so nothing errors. Asserting "it submitted" cannot tell the two apart.
   * Assert the payload.
   */
  it("forwards the optional fields it collected, not only the required ones", async () => {
    const { onSave } = setup();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("课程"), "c1");
    await user.selectOptions(screen.getByLabelText("场次"), "s1");
    await user.clear(screen.getByLabelText("报课日期"));
    await user.type(screen.getByLabelText("报课日期"), "2026-05-04");
    await user.type(screen.getByLabelText("备注"), "线下转账，平台漏记");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        courseId: "c1",
        sessionId: "s1",
        enrolledAt: "2026-05-04",
        note: "线下转账，平台漏记",
      }),
    );
  });

  it("leaves the session empty when none was picked", async () => {
    const { onSave } = setup();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("课程"), "c1");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ sessionId: null })),
    );
  });

  it("does not offer courses that are offline", () => {
    setup();

    expect(screen.queryByRole("option", { name: "已经不招了" })).toBeNull();
    expect(screen.getByRole("option", { name: "AI 炒股分析系统" })).toBeInTheDocument();
  });

  it("defaults the enrol date to today", () => {
    setup();

    expect(screen.getByLabelText("报课日期")).toHaveValue("2026-07-30");
  });

  /**
   * Every exit stays shut while the write is in flight, cancel included: a
   * dialog that can be dismissed mid-write takes the failure message with it.
   * The promise here never resolves, which is the only way to observe the
   * in-flight state at all — asserting the settled state is blind to it.
   */
  it("disables every exit while saving", async () => {
    const { onSave } = setup({ onSave: vi.fn(() => new Promise<{ ok: boolean }>(() => {})) });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("课程"), "c1");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toBeDisabled());
    expect(screen.getByRole("button", { name: /保存|正在保存/ })).toBeDisabled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and shows why when the write fails", async () => {
    const { onClose } = setup({
      onSave: vi.fn().mockResolvedValue({ ok: false, message: "这条报课已经存在" }),
    });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("课程"), "c1");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("这条报课已经存在")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
