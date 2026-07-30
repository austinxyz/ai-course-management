"use client";

import { use } from "react";

import { Sidebar } from "./students/Sidebar";

/**
 * The sidebar with its roster badge filled in, suspended on the count.
 *
 * The layout hands down the promise rather than awaiting it. Awaiting in the
 * layout would block every navigation until the roster came back — in this
 * version of Next a layout's uncached fetch is not covered by `loading.tsx`,
 * so a slow backend would stall pages that need no data at all, such as the
 * placeholder sections. Passing the promise keeps the shell synchronous and
 * confines the wait to the badge.
 */
export function SidebarWithCount({ count }: { count: Promise<number | undefined> }) {
  return <Sidebar studentCount={use(count)} />;
}
