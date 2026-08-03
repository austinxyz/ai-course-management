"use client";

import { use } from "react";

import { Sidebar } from "./students/Sidebar";
import type { NavKey } from "./students/types";

/**
 * The sidebar with its nav badges filled in, suspended on the counts.
 *
 * The layout hands down one promise for all four badges rather than
 * awaiting it. Awaiting in the layout would block every navigation until
 * the slowest count came back — in this version of Next a layout's
 * uncached fetch is not covered by `loading.tsx`, so a slow backend would
 * stall pages that need no data at all, such as the placeholder sections.
 * Passing the promise keeps the shell synchronous and confines the wait to
 * the badges.
 */
export function SidebarWithCount({
  counts,
}: {
  counts: Promise<Partial<Record<NavKey, number>>>;
}) {
  return <Sidebar counts={use(counts)} />;
}
