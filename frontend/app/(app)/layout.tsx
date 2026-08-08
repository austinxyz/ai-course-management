import { Suspense } from "react";

import {
  getCourses,
  getEnrollments,
  getHomeworkCount,
  getInteractionsCount,
  getNudgeCount,
  getStudents,
} from "@/lib/api";
import { Sidebar } from "./students/Sidebar";
import { SidebarWithCount } from "./SidebarWithCount";
import type { NavKey } from "./students/types";

/**
 * The shell every data page shares.
 *
 * The sidebar lives here rather than in each page for one concrete reason:
 * `loading.tsx` and `error.tsx` replace whatever sits *below* them. With the
 * sidebar inside a page, every load and every failure blanked the whole window
 * — a soft navigation that looked exactly like a full reload.
 *
 * The roster count is *not* awaited here. In this version of Next an uncached
 * fetch in a layout blocks navigation until it settles, and `loading.tsx` does
 * not cover it, so awaiting would make one slow backend stall every page —
 * including the placeholder sections, which fetch nothing at all. The promise
 * goes down to a client component instead, behind its own boundary. The
 * fallback is the same sidebar showing `—`: the count is unknown either way,
 * and an unknown count must not be rendered as 0.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Each rejection is swallowed *per badge*, not for the whole promise. This
  // promise is consumed by a component the layout renders itself, and
  // `(app)/error.tsx` does not wrap the layout of its own segment — letting
  // any one of these throw would take down the whole shell and land on the
  // root error page with no sidebar, exactly when the backend is cold. A
  // badge is not worth the shell: an unknown count renders as `—`, which is
  // what it already means elsewhere. Catching per-fetch also means one slow
  // or failing count (say, courses) doesn't blank out the others that did
  // come back.
  const toCount = <T,>(items: Promise<T[]>): Promise<number | undefined> =>
    items.then((rows) => rows.length).catch(() => undefined);

  const counts: Promise<Partial<Record<NavKey, number>>> = Promise.all([
    toCount(getStudents()),
    toCount(getCourses()),
    toCount(getEnrollments()),
    getHomeworkCount().catch(() => undefined),
    getNudgeCount().catch(() => undefined),
    getInteractionsCount().catch(() => undefined),
  ]).then(([students, courses, enroll, homework, nudge, interactions]) => ({
    students,
    courses,
    enroll,
    homework,
    nudge,
    interactions,
  }));

  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-background">
      <Suspense fallback={<Sidebar />}>
        <SidebarWithCount counts={counts} />
      </Suspense>
      {children}
    </div>
  );
}
