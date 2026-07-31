import { render, screen } from "@testing-library/react";
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
      {...over}
    />,
  );
}

/**
 * The confirmation used to state "他的 2 条报课、4 份作业和互动记录" for every
 * student — mock numbers copied from the design file into production. A count
 * that is always the same is worse than no count: it looks like information.
 */
describe("archive confirmation", () => {
  it("states the real number of enrolments", () => {
    panel({
      enrollments: [
        { id: "e1", studentEmail: STUDENT.email, courseId: "c1", courseName: "甲课", sessionId: null, sessionDate: null, enrolledAt: "2026-06-01", state: "enrolled", source: "manual", note: "" },
        { id: "e2", studentEmail: STUDENT.email, courseId: "c2", courseName: "乙课", sessionId: null, sessionDate: null, enrolledAt: "2026-06-02", state: "enrolled", source: "manual", note: "" },
        { id: "e3", studentEmail: STUDENT.email, courseId: "c3", courseName: "丙课", sessionId: null, sessionDate: null, enrolledAt: "2026-06-03", state: "enrolled", source: "manual", note: "" },
      ],
    });

    expect(screen.getByTestId("archive-impact")).toHaveTextContent("3 条报课");
  });

  it("does not claim homework or interactions, which this system does not hold yet", () => {
    panel();

    const impact = screen.getByTestId("archive-impact").textContent ?? "";
    expect(impact).not.toContain("作业");
    expect(impact).not.toContain("互动记录");
  });

  it("says there are none rather than 0 条报课 when the student has no records", () => {
    panel();

    expect(screen.getByTestId("archive-impact")).toHaveTextContent("没有报课记录");
  });
});

/**
 * The panel also carried a "待设计" sketch listing 报课记录 2 条 / 作业提交 4 / 6 /
 * 互动记录 最近 7 天 1 条 — more numbers copied from the design file. Now that
 * enrolments are real, the sketch sat directly above them saying something
 * different about the same student.
 */
describe("the unbuilt-sections sketch", () => {
  it("no longer claims a count for enrolments, which are real now", () => {
    panel();

    // 真实区块自己会说条数；占位块不该再声称一个
    expect(screen.getAllByText("报课记录")).toHaveLength(1);
  });

  it("does not put made-up numbers on the sections that are still unbuilt", () => {
    panel();

    expect(screen.queryByText("4 / 6")).toBeNull();
    expect(screen.queryByText("最近 7 天 1 条")).toBeNull();
  });
});
