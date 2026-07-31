import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DetailPanel } from "./DetailPanel";
import { EnrollmentRows } from "./EnrollmentRows";
import { StudentsTable } from "./StudentsTable";
import type { Enrollment, Student } from "./types";

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

function panel() {
  const noop = vi.fn();
  const { container } = render(
    <DetailPanel
      student={STUDENT}
      isArchived={false}
      editKey={null}
      editValue=""
      tagEditing={false}
      askArchive={false}
      archivePending={false}
      archiveError={null}
      fieldStatus={{}}
      enrollments={[]}
      sessionsByCourse={{}}
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
      onFillWechat={noop}
      onChangeEnrollmentSession={vi.fn().mockResolvedValue({ ok: true })}
      onDeleteEnrollment={vi.fn().mockResolvedValue({ ok: true })}
    />,
  );
  return container;
}

/**
 * 详情面板从 358px 加宽到 560px，字段改成两列。
 *
 * 这偏离设计稿（稿子是 358px 固定右栏）——是用户 2026-07-31 有意提的改动：
 * 面板里有 10 个字段 + 标签 + 备注 + 报课记录，单列 358px 太挤。
 * 不做五五分是因为列表有 8 列，每让出 50px 都直接增加横向滚动的幅度。
 */
describe("详情面板加宽并分两列", () => {
  it("面板宽 560px，不再是 358px", () => {
    const container = panel();

    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("w-[560px]");
    expect(aside?.className).not.toContain("w-[358px]");
  });

  it("字段区是两列网格", () => {
    const container = panel();

    const grid = container.querySelector("[data-field='name']")?.parentElement;
    expect(grid?.className).toMatch(/grid-cols-2/);
  });
});

/**
 * 横向滚动时姓名列钉在左边。
 *
 * 这个系统最主要的工作流是拿着微信群名单人工对齐（CLAUDE.md §5）——
 * 滚到右边看「微信号」时若姓名跟着滚走，就不知道这一行是谁了。
 * 丢失定位列比列窄更难受。
 */
describe("姓名列在横向滚动时钉住", () => {
  const rows = [STUDENT];

  it("表头的姓名格是 sticky 的", () => {
    render(<StudentsTable rows={rows} selectedEmail={null} archived={[]} onSelect={vi.fn()} />);

    const th = screen.getByText("姓名").closest("th");
    expect(th?.className).toContain("sticky");
    expect(th?.className).toContain("left-0");
  });

  it("数据行的姓名格也 sticky，且自带背景色", () => {
    const { container } = render(
      <StudentsTable rows={rows} selectedEmail={null} archived={[]} onSelect={vi.fn()} />,
    );

    const td = container.querySelector("tbody tr td");
    expect(td?.className).toContain("sticky");
    expect(td?.className).toContain("left-0");
    // 没有背景色的话，滚过去的内容会从这一格底下透出来
    expect(td?.className).toMatch(/bg-/);
  });
});

describe("报课记录的课程名", () => {
  it("最多两行再省略，而不是单行截断", () => {
    const row: Enrollment = {
      id: "e1",
      studentEmail: "alpha@example.com",
      courseId: "c1",
      courseName: "AI 炒股分析系统 — 从方法论到可运行 Skill",
      sessionId: null,
      sessionDate: null,
      enrolledAt: "2026-06-18",
      state: "enrolled",
      source: "derived",
      note: "",
    };
    render(
      <EnrollmentRows
        enrollments={[row]}
        sessionsByCourse={{}}
        onAdd={vi.fn()}
        onChangeSession={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const name = within(screen.getByTestId("enrollment-e1")).getByText(row.courseName);
    expect(name.className).toContain("line-clamp-2");
    expect(name.className).not.toContain("whitespace-nowrap");
  });
});
