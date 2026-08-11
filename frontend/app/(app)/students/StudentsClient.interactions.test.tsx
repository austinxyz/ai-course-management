import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StudentsClient } from "./StudentsClient";
import type { Student } from "./types";

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

describe("学员详情面板不再有手动录入入口", () => {
  // 手动录入搬到了互动记录独立页常驻面板（interactions-design-alignment
  // design.md 决定 7），学员详情面板不再渲染 ManualInteractionModal。
  it("详情面板没有「+ 手动记录」按钮", () => {
    const alpha = student({ email: "alpha@example.com", name: "学员甲" });

    render(
      <StudentsClient students={[alpha]} archivedStudents={[]} enrollments={[]} courses={[]} />,
    );

    expect(screen.queryByRole("button", { name: "+ 手动记录" })).not.toBeInTheDocument();
  });
});
