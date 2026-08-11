import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InteractionsClient } from "./InteractionsClient";
import type { Interaction } from "./types";

function interaction(over: Partial<Interaction> = {}): Interaction {
  return {
    studentEmail: "alpha@example.com",
    studentName: "学员甲",
    courseId: "c1",
    courseName: "从零开始用 Claude 和 Cowork",
    eventType: "nudged",
    channel: "email",
    note: "",
    at: "2026-08-06T09:12:00Z",
    ...over,
  };
}

function baseProps(over: Record<string, unknown> = {}) {
  return {
    interactions: [],
    students: [],
    enrollments: [],
    onSubmitManual: vi.fn().mockResolvedValue({ ok: true }),
    onSubmitSignal: vi.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
}

describe("默认展示", () => {
  it("按时间倒序展示全部互动记录，来源 tab 停在“全部”", () => {
    render(
      <InteractionsClient
        {...baseProps({
          interactions: [
            interaction({ studentName: "学员甲", at: "2026-08-05T00:00:00Z" }),
            interaction({ studentName: "学员乙", at: "2026-08-06T00:00:00Z" }),
          ],
        })}
      />,
    );

    const rows = screen.getAllByTestId(/^interaction-row-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("学员乙");
    expect(rows[1]).toHaveTextContent("学员甲");
    expect(screen.getByRole("button", { name: /全部/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("按来源 tab 筛选", () => {
  it("来源 tab 数字与列表条数一致", () => {
    render(
      <InteractionsClient
        {...baseProps({
          interactions: [
            interaction({ eventType: "nudged" }),
            interaction({ eventType: "skipped" }),
            interaction({ eventType: "manual", channel: "1on1", note: "内容" }),
            interaction({ eventType: "participation", channel: "live", note: "" }),
          ],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /全部.*4/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /系统自动.*2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /人工录入.*1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /参与度.*1/ })).toBeInTheDocument();
  });

  it("点击「人工录入」后只显示人工录入类型的记录", async () => {
    render(
      <InteractionsClient
        {...baseProps({
          interactions: [
            interaction({ eventType: "nudged", studentName: "学员甲" }),
            interaction({ eventType: "manual", channel: "1on1", note: "内容", studentName: "学员乙" }),
          ],
        })}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /人工录入/ }));

    const rows = screen.getAllByTestId(/^interaction-row-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("学员乙");
  });
});

describe("按搜索词筛选", () => {
  it("搜索框按学员姓名匹配", async () => {
    render(
      <InteractionsClient
        {...baseProps({
          interactions: [
            interaction({ studentEmail: "alpha@example.com", studentName: "学员甲" }),
            interaction({ studentEmail: "bravo@example.com", studentName: "学员乙" }),
          ],
        })}
      />,
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("搜学员、类型或内容"), "学员甲");

    const rows = screen.getAllByTestId(/^interaction-row-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("学员甲");
  });

  it("来源 tab 与搜索词可以叠加", async () => {
    render(
      <InteractionsClient
        {...baseProps({
          interactions: [
            interaction({ eventType: "participation", channel: "live", studentName: "学员甲" }),
            interaction({ eventType: "participation", channel: "live", studentName: "学员乙" }),
            interaction({ eventType: "nudged", studentName: "学员甲" }),
          ],
        })}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /参与度/ }));
    await user.type(screen.getByLabelText("搜学员、类型或内容"), "学员甲");

    const rows = screen.getAllByTestId(/^interaction-row-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("学员甲");
  });
});

describe("深链接预填搜索框", () => {
  it("initialQuery 存在时搜索框初始值就是它", () => {
    render(
      <InteractionsClient
        {...baseProps({
          interactions: [interaction({ studentEmail: "alpha@example.com" })],
          initialQuery: "alpha@example.com",
        })}
      />,
    );

    expect(screen.getByLabelText("搜学员、类型或内容")).toHaveValue("alpha@example.com");
  });
});

describe("空结果", () => {
  it("筛选组合下没有记录时显示说明文案", async () => {
    render(<InteractionsClient {...baseProps({ interactions: [interaction({ studentName: "学员甲" })] })} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("搜学员、类型或内容"), "不存在的学员");

    expect(screen.getByText("没有符合条件的记录。")).toBeInTheDocument();
  });
});

describe("写入成功后的提示条", () => {
  it("手动录入成功后显示“已写入”，点“知道了”后消失", async () => {
    const onSubmitManual = vi.fn().mockResolvedValue({ ok: true });
    render(
      <InteractionsClient
        {...baseProps({
          interactions: [],
          students: [{ email: "alpha@example.com", name: "学员甲" }],
          enrollments: [{ studentEmail: "alpha@example.com", state: "enrolled" }],
          onSubmitManual,
        })}
      />,
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("学员"), "alpha@example.com");
    await user.click(screen.getByRole("button", { name: "1:1 沟通" }));
    await user.type(screen.getByLabelText("内容"), "聊了下学习进度");
    await user.click(screen.getByRole("button", { name: "追加这条" }));

    expect(await screen.findByText("已写入")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(screen.queryByText("已写入")).not.toBeInTheDocument();
  });
});
