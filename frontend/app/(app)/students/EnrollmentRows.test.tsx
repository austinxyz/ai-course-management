import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EnrollmentRows } from "./EnrollmentRows";
import type { Enrollment } from "./types";

function row(over: Partial<Enrollment> = {}): Enrollment {
  return {
    id: "e1",
    studentEmail: "alpha@example.com",
    courseId: "c1",
    courseName: "AI 炒股分析系统",
    sessionId: "s1",
    sessionDate: "2026-07-26",
    enrolledAt: "2026-06-18",
    state: "completed",
    source: "manual",
    note: "",
    homeworkTotal: null,
    ...over,
  };
}

describe("EnrollmentRows", () => {
  it("shows the course, session, enrol date and state of each record", () => {
    render(<EnrollmentRows enrollments={[row()]} onAdd={vi.fn()} sessionsByCourse={{}} onChangeSession={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("AI 炒股分析系统")).toBeInTheDocument();
    expect(screen.getByText(/2026-07-26/)).toBeInTheDocument();
    expect(screen.getByText(/2026-06-18/)).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
  });

  /**
   * Blank reads as "this record has no session concept". What it actually means
   * is "somebody still has to assign this person a sitting" — a state that
   * needs following up, so it has to be legible.
   */
  it("spells out an undecided session rather than leaving it blank", () => {
    render(
      <EnrollmentRows
        enrollments={[row({ sessionId: null, sessionDate: null, state: "enrolled" })]}
        onAdd={vi.fn()}
        sessionsByCourse={{}}
        onChangeSession={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("未定场次")).toBeInTheDocument();
  });

  it("says so when there are no records at all", () => {
    render(<EnrollmentRows enrollments={[]} onAdd={vi.fn()} sessionsByCourse={{}} onChangeSession={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText(/还没有报课记录/)).toBeInTheDocument();
  });

  /**
   * The state shown is whatever the server derived. The frontend must not work
   * it out from the session date: anything a client can compute for itself is
   * not a property of the data, and two implementations of the same rule drift
   * apart at some boundary.
   */
  it("renders the state the server gave, without re-deriving it", () => {
    render(
      <EnrollmentRows
        enrollments={[row({ sessionDate: "2020-01-01", state: "enrolled" })]}
        onAdd={vi.fn()}
        sessionsByCourse={{}}
        onChangeSession={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // 场次日期早已过去，但服务端说「报名」（例如那一场被取消了）——就显示报名
    expect(screen.getByText("报名")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).toBeNull();
  });
});

describe("作业情况概要", () => {
  it("有提交时显示已交与总分，链接跳转到对应课程与学员", () => {
    render(
      <EnrollmentRows
        enrollments={[row({ homeworkTotal: 77 })]}
        onAdd={vi.fn()}
        sessionsByCourse={{}}
        onChangeSession={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: /已交.*77 分/ });
    expect(link).toHaveAttribute("href", "/homework?course=c1&student=alpha%40example.com");
    // 已交要醒目——用成功语气的绿色，不是普通链接蓝。
    expect(link.className).toContain("text-success");
  });

  it("没有提交时显示未交，同样可点击跳转", () => {
    render(
      <EnrollmentRows
        enrollments={[row({ homeworkTotal: null })]}
        onAdd={vi.fn()}
        sessionsByCourse={{}}
        onChangeSession={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: "未交" });
    expect(link).toHaveAttribute("href", "/homework?course=c1&student=alpha%40example.com");
    // 未交要醒目——danger 红，不是灰掉的次要信息。
    expect(link.className).toContain("text-danger");
  });

  it("每条报课记录各自显示自己那门课的作业情况", () => {
    render(
      <EnrollmentRows
        enrollments={[
          row({ id: "e1", courseId: "c1", homeworkTotal: 77 }),
          row({ id: "e2", courseId: "c2", courseName: "先造枪", homeworkTotal: null }),
        ]}
        onAdd={vi.fn()}
        sessionsByCourse={{}}
        onChangeSession={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const first = within(screen.getByTestId("enrollment-e1"));
    const second = within(screen.getByTestId("enrollment-e2"));
    expect(first.getByRole("link", { name: /已交/ })).toBeInTheDocument();
    expect(second.getByRole("link", { name: "未交" })).toBeInTheDocument();
  });
});
