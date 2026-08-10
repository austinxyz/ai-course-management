import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ManualInteractionModal } from "./ManualInteractionModal";

const COURSES = [
  { id: "c1", name: "从零开始用 Claude 和 Cowork" },
  { id: "c2", name: "先造枪：建知识库" },
];

function modal(over: Record<string, unknown> = {}) {
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const onClose = vi.fn();
  render(
    <ManualInteractionModal
      studentName="学员甲"
      courses={COURSES}
      onSave={onSave}
      onClose={onClose}
      {...over}
    />,
  );
  return { onSave, onClose };
}

describe("手动记录弹窗", () => {
  // 课程范围本身（只含该学员已报的课）由调用方（StudentsClient）过滤后传入
  // `courses` prop（design.md 决定 2）——弹窗只管渲染传入的课程，不做过滤。
  it("课程下拉渲染传入的每一门课程", () => {
    modal();

    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("从零开始用 Claude 和 Cowork");
    expect(options).toContain("先造枪：建知识库");
  });

  it("内容为空时保存按钮禁用，填入后启用", async () => {
    modal();
    const user = userEvent.setup();

    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("课程"), "c1");
    await user.type(screen.getByLabelText("内容"), "聊了下学习进度");

    expect(save).toBeEnabled();
  });

  it("提交失败时错误文案 inline 显示，弹窗不关闭", async () => {
    const { onClose } = modal({
      onSave: vi.fn().mockResolvedValue({ ok: false, message: "没保存上。" }),
    });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("课程"), "c1");
    await user.type(screen.getByLabelText("内容"), "聊了下学习进度");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("没保存上。")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
