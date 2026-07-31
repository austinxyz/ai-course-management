import { render, screen } from "@testing-library/react";
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
