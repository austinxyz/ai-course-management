import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/interactions" }));

const getInteractions = vi.fn(async () => []);
const getStudents = vi.fn(async () => []);
const getEnrollments = vi.fn(async () => []);
vi.mock("@/lib/api", () => ({
  getInteractions: (...args: unknown[]) => getInteractions(...args),
  getStudents: (...args: unknown[]) => getStudents(...args),
  getEnrollments: (...args: unknown[]) => getEnrollments(...args),
}));
vi.mock("./actions", () => ({
  createInteractionAction: vi.fn(),
  deleteInteractionAction: vi.fn(),
}));

import InteractionsPage from "./page";

describe("互动记录页 searchParams.student 深链接", () => {
  it("student 参数存在时，搜索框初始值就是这个学员邮箱", async () => {
    const jsx = await InteractionsPage({
      searchParams: Promise.resolve({ student: "alpha@example.com" }),
    });
    render(jsx);

    expect(screen.getByLabelText("搜学员、类型或内容")).toHaveValue("alpha@example.com");
  });

  it("没有 student 参数时，搜索框不预填", async () => {
    const jsx = await InteractionsPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByLabelText("搜学员、类型或内容")).toHaveValue("");
  });
});
