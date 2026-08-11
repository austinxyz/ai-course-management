import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DetailPanel } from "./DetailPanel";
import type { Student } from "./types";

vi.mock("next/navigation", () => ({ usePathname: () => "/students" }));

const STUDENT: Student = {
  name: "学员甲",
  email: "alpha@example.com",
  gender: "",
  age: "",
  industry: "",
  wechat: "",
  nick: "—",
  wxName: "—",
  source: "讲武堂",
  region: "美东",
  tz: "UTC-5",
  level: "小白",
  tags: [],
  note: "",
};

function interaction(over: Record<string, unknown> = {}) {
  return {
    studentEmail: STUDENT.email,
    studentName: STUDENT.name,
    courseId: "c1",
    courseName: "从零开始用 Claude 和 Cowork",
    eventType: "nudged",
    channel: "email",
    note: "",
    at: "2026-08-06T09:12:00Z",
    ...over,
  };
}

function panel(over: Record<string, unknown> = {}) {
  const noop = vi.fn();
  render(
    <DetailPanel
      student={STUDENT}
      isArchived={false}
      editKey={null}
      editValue=""
      tagEditing={false}
      askArchive
      archivePending={false}
      archiveError={null}
      fieldStatus={{}}
      enrollments={[]}
      interactions={[]}
      onRetryField={noop}
      onClose={noop}
      onStartEdit={noop}
      onEditValueChange={noop}
      onCommitEdit={noop}
      onEditKeyDown={noop}
      onPickEnum={noop}
      onToggleTagEditing={noop}
      onToggleTag={noop}
      onAskArchive={noop}
      onCancelArchive={noop}
      onArchive={noop}
      onRestore={noop}
      onAddEnrollment={noop}
      sessionsByCourse={{}}
      onChangeEnrollmentSession={vi.fn().mockResolvedValue({ ok: true })}
      onDeleteEnrollment={vi.fn().mockResolvedValue({ ok: true })}
      onFillWechat={noop}
      {...over}
    />,
  );
}

describe("最近互动卡片", () => {
  // 截断到最多 5 条是 StudentsClient 的职责（design.md 决定 4）——DetailPanel
  // 只管渲染传进来的内容，不重新截断。这里只验证"渲染传入的每一条"。
  it("渲染传入的互动记录", () => {
    const five = Array.from({ length: 5 }, (_, i) => interaction({ note: `第${i}条` }));
    panel({ interactions: five });

    const rows = screen.getAllByTestId(/^recent-interaction-/);
    expect(rows).toHaveLength(5);
  });

  it("没有互动记录时显示说明文案", () => {
    panel({ interactions: [] });

    expect(screen.getByText("还没有互动记录。")).toBeInTheDocument();
  });

  // 手动录入搬到了互动记录独立页常驻面板（interactions-design-alignment
  // design.md 决定 7），这里不再有入口。
  it("不再有「+ 手动记录」入口", () => {
    panel({ interactions: [] });

    expect(screen.queryByRole("button", { name: "+ 手动记录" })).not.toBeInTheDocument();
  });
});
