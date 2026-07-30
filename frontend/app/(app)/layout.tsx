import { Suspense } from "react";

import { getStudents } from "@/lib/api";
import { Sidebar } from "./students/Sidebar";
import { SidebarWithCount } from "./SidebarWithCount";

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
  const count = getStudents().then((students) => students.length);

  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-background">
      <Suspense fallback={<Sidebar />}>
        <SidebarWithCount count={count} />
      </Suspense>
      {children}
    </div>
  );
}
