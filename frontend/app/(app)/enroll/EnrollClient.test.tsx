import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { EnrollClient } from "./EnrollClient";
import type { Enrollment } from "@/app/(app)/students/types";

function row(over: Partial<Enrollment> = {}): Enrollment {
  return {
    id: "e1",
    studentEmail: "alpha@example.com",
    courseId: "c1",
    courseName: "从零开始",
    sessionId: null,
    sessionDate: null,
    enrolledAt: "2026-06-07",
    state: "enrolled",
    source: "derived",
    note: "",
    ...over,
  };
}

const NAMES = { "alpha@example.com": "学员甲", "bravo@example.com": "学员乙" };

describe("报课总表", () => {
  it("逐条显示学员、课程、场次、报课日期、状态与来源", () => {
    render(<EnrollClient enrollments={[row()]} namesByEmail={NAMES} />);

    const line = within(screen.getByTestId("enroll-row-e1"));
    expect(line.getByText("学员甲")).toBeInTheDocument();
    expect(line.getByText("alpha@example.com")).toBeInTheDocument();
    expect(line.getByText("从零开始")).toBeInTheDocument();
    expect(line.getByText("2026-06-07")).toBeInTheDocument();
    expect(line.getByText("报名")).toBeInTheDocument();
    expect(line.getByText("倒推")).toBeInTheDocument();
  });

  /**
   * 倒推进来的记录全是未定场次，所以这不是边缘情况，而是这一页的主要内容。
   * 留白读作"没有场次这个概念"，实际含义是"还得有人给他指派一场"。
   */
  it("未定场次要看得出来，不能留白", () => {
    render(<EnrollClient enrollments={[row()]} namesByEmail={NAMES} />);

    expect(within(screen.getByTestId("enroll-row-e1")).getByText("未定场次")).toBeInTheDocument();
  });

  it("按课程筛选后只剩该课程的记录，并显示条数", async () => {
    render(
      <EnrollClient
        enrollments={[row(), row({ id: "e2", courseId: "c2", courseName: "先造枪" })]}
        namesByEmail={NAMES}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /先造枪/ }));

    expect(screen.queryByTestId("enroll-row-e1")).toBeNull();
    expect(screen.getByTestId("enroll-row-e2")).toBeInTheDocument();
    expect(screen.getByText(/1 条/)).toBeInTheDocument();
  });

  it("一条都没有时给出说明，而不是空表格", () => {
    render(<EnrollClient enrollments={[]} namesByEmail={{}} />);

    expect(screen.getByText(/还没有任何报课记录/)).toBeInTheDocument();
  });

  /**
   * 只读是有意的：写入仍只在学员详情一处。同一件事有两条写入路径，
   * 两边就会慢慢长出不同的校验。
   */
  it("页面不提供任何修改或删除入口", () => {
    render(<EnrollClient enrollments={[row()]} namesByEmail={NAMES} />);

    expect(screen.queryByRole("button", { name: /改场次|删除|编辑|补录/ })).toBeNull();
  });
});
