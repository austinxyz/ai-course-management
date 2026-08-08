import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/interactions" }));

const getInteractions = vi.fn(async () => [
  {
    studentEmail: "alpha@example.com",
    studentName: "学员甲",
    courseId: "c1",
    courseName: "课程甲",
    eventType: "nudged",
    channel: "email",
    note: "",
    at: "2026-08-06T09:12:00Z",
  },
]);
vi.mock("@/lib/api", () => ({
  getInteractions: (...args: unknown[]) => getInteractions(...args),
}));

import InteractionsPage from "./page";

describe("互动记录页 searchParams.student 深链接", () => {
  it("student 参数存在时，学员筛选器初始值就是这个学员", async () => {
    const jsx = await InteractionsPage({
      searchParams: Promise.resolve({ student: "alpha@example.com" }),
    });
    render(jsx);

    expect(screen.getByLabelText("按学员筛选")).toHaveValue("alpha@example.com");
  });

  it("没有 student 参数时，学员筛选器不预选任何人", async () => {
    const jsx = await InteractionsPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByLabelText("按学员筛选")).toHaveValue("");
  });
});
