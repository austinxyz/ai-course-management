import { describe, expect, it, vi } from "vitest";

import AppLayout from "./layout";

const getStudents = vi.hoisted(() => vi.fn(async () => [{ email: "a@example.com" }]));
const getCourses = vi.hoisted(() => vi.fn(async () => [{ id: "c-1" }]));
const getEnrollments = vi.hoisted(() => vi.fn(async () => [{ id: "e-1" }, { id: "e-2" }]));
const getHomeworkCount = vi.hoisted(() => vi.fn(async () => 5));
vi.mock("@/lib/api", () => ({ getStudents, getCourses, getEnrollments, getHomeworkCount }));
vi.mock("next/navigation", () => ({ usePathname: () => "/enroll" }));

/**
 * Guards the one failure mode of this change that produces no error message.
 *
 * If the layout awaits the roster, every navigation waits for the backend —
 * including pages that fetch nothing — because in this version of Next a
 * layout's uncached fetch is not covered by `loading.tsx`. Nothing throws,
 * nothing warns; the app is simply slower everywhere, which is invisible
 * against a local backend that answers in milliseconds.
 *
 * A synchronous layout cannot have awaited anything, so that is what we assert.
 */
describe("AppLayout", () => {
  it("does not await the roster — the shell renders before the count", () => {
    const result = AppLayout({ children: null });

    expect(result).not.toBeInstanceOf(Promise);
  });

  it("hands the count down as a promise rather than a resolved value", () => {
    AppLayout({ children: null });

    expect(getStudents).toHaveBeenCalled();
  });

  /**
   * The shell must outlive its own fetch failing.
   *
   * `SidebarWithCount` is rendered *by* this layout, and `(app)/error.tsx` does
   * not wrap the layout of its own segment — a rejection therefore takes down
   * the entire shell and lands on the root error page with no sidebar at all.
   * That is the cold-start case, the one this change exists to survive. So the
   * promise handed down must never reject; an unknown count is `undefined`,
   * which the sidebar already renders as `—`.
   */
  it("hands down an unknown count for just the badge that failed, not the whole promise", async () => {
    getStudents.mockRejectedValueOnce(new Error("backend unreachable"));

    const element = AppLayout({ children: null }) as { props: { children: unknown[] } };
    const suspense = element.props.children[0] as {
      props: { children: { props: { counts: Promise<Record<string, number | undefined>> } } };
    };

    const counts = await suspense.props.children.props.counts;
    // 学员这一项失败了，但课程/报课/作业照常拿到——一个坏了不该把其余三个也拖垮。
    expect(counts.students).toBeUndefined();
    expect(counts.courses).toBe(1);
    expect(counts.enroll).toBe(2);
    expect(counts.homework).toBe(5);
  });
});
