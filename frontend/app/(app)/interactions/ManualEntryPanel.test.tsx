import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ManualEntryPanel } from "./ManualEntryPanel";

const STUDENTS = [
  { email: "alpha@example.com", name: "学员甲" },
  { email: "bravo@example.com", name: "学员乙" },
];

function panel(over: Record<string, unknown> = {}) {
  const onSubmitManual = vi.fn().mockResolvedValue({ ok: true });
  const onRequestSignal = vi.fn();
  const onWritten = vi.fn();
  render(
    <ManualEntryPanel
      students={STUDENTS}
      enrollments={[{ studentEmail: "alpha@example.com", state: "enrolled" }]}
      onSubmitManual={onSubmitManual}
      onRequestSignal={onRequestSignal}
      onWritten={onWritten}
      {...over}
    />,
  );
  return { onSubmitManual, onRequestSignal, onWritten };
}

describe("参与度信号", () => {
  it("未选学员时 5 个信号按钮禁用", () => {
    panel();

    for (const label of ["出席直播", "加入兴趣小组", "兴趣小组长", "兴趣小组积极发言", "Demo Day 参展"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });

  it("选中有有效报课的学员后，点击信号只抛出待确认请求，不直接写入", async () => {
    const { onRequestSignal, onWritten } = panel();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("学员"), "alpha@example.com");
    await user.click(screen.getByRole("button", { name: "出席直播" }));

    expect(onRequestSignal).toHaveBeenCalledWith({ studentEmail: "alpha@example.com", signal: "live" });
    expect(onWritten).not.toHaveBeenCalled();
  });

  it("选中没有有效报课的学员时，信号按钮保持禁用并显示说明文案", async () => {
    panel();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("学员"), "bravo@example.com");

    expect(screen.getByRole("button", { name: "出席直播" })).toBeDisabled();
    expect(screen.getByText(/没有在读课程/)).toBeInTheDocument();
  });
});

describe("记一条", () => {
  it("没选学员或没写内容时保存按钮禁用", async () => {
    panel();
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "追加这条" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("学员"), "alpha@example.com");
    expect(screen.getByRole("button", { name: "追加这条" })).toBeDisabled();

    await user.type(screen.getByLabelText("内容"), "聊了下学习进度");
    expect(screen.getByRole("button", { name: "追加这条" })).toBeEnabled();
  });

  it("提交后调用 onSubmitManual 并触发 onWritten", async () => {
    const { onSubmitManual, onWritten } = panel();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("学员"), "alpha@example.com");
    await user.click(screen.getByRole("button", { name: "咨询" }));
    await user.type(screen.getByLabelText("内容"), "问了个技术问题");
    await user.click(screen.getByRole("button", { name: "追加这条" }));

    expect(onSubmitManual).toHaveBeenCalledWith({
      studentEmail: "alpha@example.com",
      type: "consult",
      note: "问了个技术问题",
    });
    expect(onWritten).toHaveBeenCalledTimes(1);
  });

  it("没有有效报课的学员，提交按钮保持禁用", async () => {
    panel();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("学员"), "bravo@example.com");
    await user.type(screen.getByLabelText("内容"), "内容");

    expect(screen.getByRole("button", { name: "追加这条" })).toBeDisabled();
  });
});
