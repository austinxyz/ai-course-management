// Server Component — exercises the wiring, not rendering (that's NudgeClient's job).
import { describe, expect, it, vi } from "vitest";

const getCourses = vi.fn();
const getNudgeList = vi.fn();
vi.mock("@/lib/api", () => ({ getCourses: (...a: unknown[]) => getCourses(...a), getNudgeList: (...a: unknown[]) => getNudgeList(...a) }));

const nudgeClientProps: unknown[] = [];
vi.mock("./NudgeClient", () => ({
  NudgeClient: (props: unknown) => {
    nudgeClientProps.push(props);
    return null;
  },
}));

import NudgePage from "./page";

describe("NudgePage", () => {
  it("把后端 skipped_count 透传给 NudgeClient 的 skippedCount", async () => {
    nudgeClientProps.length = 0;
    getCourses.mockResolvedValue([{ id: "c1", name: "课程甲" }]);
    getNudgeList.mockResolvedValue({
      people: [{ studentEmail: "a@example.com", name: "甲", wechat: "", courseId: "c1", overdueDays: 1, history: [] }],
      skippedCount: 3,
    });

    const element = await NudgePage({ searchParams: Promise.resolve({ course: "c1" }) });
    // Server Component 返回的是元素树；渲染它以触发被 mock 的 NudgeClient。
    const { render } = await import("@testing-library/react");
    render(element as React.ReactElement);

    expect(nudgeClientProps[0]).toMatchObject({ skippedCount: 3, people: expect.any(Array) });
  });
});
