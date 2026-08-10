import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StudentsClient } from "./StudentsClient";
import type { Enrollment, Student } from "./types";

vi.mock("next/navigation", () => ({ usePathname: () => "/students" }));

function student(over: Partial<Student> = {}): Student {
  return {
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
    ...over,
  };
}

function interaction(email: string, at: string, note = "") {
  return {
    studentEmail: email,
    studentName: "",
    courseId: "c1",
    courseName: "课程甲",
    eventType: "nudged",
    channel: "email",
    note,
    at,
  };
}

describe("最近互动卡片收到按学员过滤、最多 5 条、时间倒序的子集", () => {
  it("只把选中学员的记录传给 DetailPanel，且最多 5 条", async () => {
    const alpha = student({ email: "alpha@example.com", name: "学员甲" });
    const bravo = student({ email: "bravo@example.com", name: "学员乙" });
    const alphaInteractions = Array.from({ length: 7 }, (_, i) =>
      interaction("alpha@example.com", `2026-08-0${(i % 9) + 1}T00:00:00Z`, `第${i}条`),
    );
    const bravoInteraction = interaction("bravo@example.com", "2026-08-01T00:00:00Z", "不该出现");

    // 第一位学员默认就是选中态（StudentsClient 的 `selected` 初值），
    // 不需要额外点击——点了反而会把它切回未选中。
    render(
      <StudentsClient
        students={[alpha, bravo]}
        archivedStudents={[]}
        enrollments={[]}
        courses={[]}
        interactions={[...alphaInteractions, bravoInteraction]}
      />,
    );

    const rows = screen.getAllByTestId(/^recent-interaction-/);
    expect(rows).toHaveLength(5);
    expect(screen.queryByText("不该出现")).not.toBeInTheDocument();
  });
});

function enrollment(over: Partial<Enrollment> = {}): Enrollment {
  return {
    id: "e1",
    studentEmail: "alpha@example.com",
    courseId: "c1",
    courseName: "课程甲",
    sessionId: null,
    sessionDate: null,
    enrolledAt: "2026-06-01",
    state: "enrolled",
    source: "manual",
    note: "",
    homeworkTotal: null,
    ...over,
  };
}

describe("手动记录弹窗的课程下拉排除退课的报课记录", () => {
  it("只列出该学员在读的课程，不含已退课的", async () => {
    const alpha = student({ email: "alpha@example.com", name: "学员甲" });
    const enrolled = enrollment({ id: "e1", courseId: "c1", courseName: "在读课", state: "enrolled" });
    const withdrawn = enrollment({ id: "e2", courseId: "c2", courseName: "已退课", state: "withdrawn" });

    render(
      <StudentsClient
        students={[alpha]}
        archivedStudents={[]}
        enrollments={[enrolled, withdrawn]}
        courses={[]}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "+ 手动记录" }));

    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("在读课");
    expect(options).not.toContain("已退课");
  });
});
