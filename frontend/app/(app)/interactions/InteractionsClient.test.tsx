import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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

describe("默认展示", () => {
  it("按时间倒序展示全部互动记录", () => {
    render(
      <InteractionsClient
        interactions={[
          interaction({ studentName: "学员甲", at: "2026-08-05T00:00:00Z" }),
          interaction({ studentName: "学员乙", at: "2026-08-06T00:00:00Z" }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId(/^interaction-row-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("学员乙");
    expect(rows[1]).toHaveTextContent("学员甲");
  });

  it("默认不筛选时间——很久以前的记录也照常展示", () => {
    // 回归测试：曾经默认预选中"最近 7 天"，导致刚打开页面就已经在筛选，
    // 违反 spec"不做任何筛选时展示全部学员的互动记录"这条要求。
    const longAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    render(<InteractionsClient interactions={[interaction({ studentName: "很久以前", at: longAgo })]} />);

    expect(screen.getAllByTestId(/^interaction-row-/)).toHaveLength(1);
  });
});

describe("按学员过滤", () => {
  it("选中某学员后只显示这个人的记录", async () => {
    render(
      <InteractionsClient
        interactions={[
          interaction({ studentEmail: "alpha@example.com", studentName: "学员甲" }),
          interaction({ studentEmail: "bravo@example.com", studentName: "学员乙" }),
        ]}
      />,
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("按学员筛选"), "alpha@example.com");

    const rows = screen.getAllByTestId(/^interaction-row-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("学员甲");
  });

  it("学员筛选器只列出实际有过互动记录的学员", () => {
    render(
      <InteractionsClient
        interactions={[
          interaction({ studentEmail: "alpha@example.com", studentName: "学员甲" }),
          interaction({ studentEmail: "alpha@example.com", studentName: "学员甲" }),
        ]}
      />,
    );

    const options = screen.getAllByRole("option");
    // "全部学员" + 一个去重后的学员，不是两条重复选项
    expect(options).toHaveLength(2);
  });
});

describe("按时间范围过滤", () => {
  it("今天预设保留今天已经发生的记录，不是全部排除", async () => {
    // 回归测试：曾经"今天"用"过去 0 天"算窗口起点，等价于 Date.now()，
    // 于是今天已经发生的事件全部被判定为"不在窗口内"，筛不出任何结果。
    const earlierToday = new Date();
    earlierToday.setHours(0, 30, 0, 0);
    render(
      <InteractionsClient
        interactions={[interaction({ studentName: "今天早些时候", at: earlierToday.toISOString() })]}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "今天" }));

    expect(screen.getAllByTestId(/^interaction-row-/)).toHaveLength(1);
  });

  it("最近 7 天预设只保留 7 天内的记录", async () => {
    const now = new Date();
    const within = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const outside = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <InteractionsClient
        interactions={[
          interaction({ studentName: "近期", at: within }),
          interaction({ studentName: "很久以前", at: outside }),
        ]}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "最近 7 天" }));

    const rows = screen.getAllByTestId(/^interaction-row-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("近期");
  });
});

describe("空结果", () => {
  it("筛选组合下没有记录时显示说明文案", async () => {
    render(<InteractionsClient interactions={[interaction({ studentName: "学员甲" })]} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("按学员筛选"), "alpha@example.com");
    await user.click(screen.getByRole("button", { name: "今天" }));

    // 固定的 mock 数据时间戳不在"今天"，所以筛出空结果
    expect(screen.getByText("这段时间没有互动记录。")).toBeInTheDocument();
  });
});
