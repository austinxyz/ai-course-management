"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { NAV } from "./vocab";
import type { NavKey } from "./types";

interface SidebarProps {
  /**
   * Keyed by nav item — `students`/`courses`/`enroll`/`homework` all get a
   * live total the same way. A key missing from the map (or the whole prop
   * omitted) shows `—` rather than 0 — a page that never counted must not
   * claim there are none. The same `—` is what shows while the count is
   * still in flight. `nudge` has a real page now but no count wired up yet;
   * `interactions` is still a placeholder page with no backing data. Neither
   * is ever in this map, so both always show `—`.
   */
  counts?: Partial<Record<NavKey, number>>;
}

/**
 * Highlight is derived from the route, never passed in and never held as state.
 *
 * As a prop it could only move once the destination page had rendered, so a
 * click produced no feedback until the data arrived. As state it could drift
 * from the URL after a back/forward. The route is the answer to "where am I",
 * so read it directly.
 */
export function Sidebar({ counts }: SidebarProps) {
  const pathname = usePathname();
  const activeKey = NAV.find((item) => pathname.startsWith(item.href))?.key;

  return (
    <aside className="flex w-[216px] flex-none flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-[3px] border-b border-sidebar-border px-4 pb-4 pt-[18px]">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 flex-none items-center justify-center rounded-[5px] bg-primary font-mono text-[11px] font-semibold leading-none text-primary-foreground">
            C
          </div>
          <div className="font-sans text-sm font-semibold leading-tight tracking-wide text-sidebar-foreground-bright">
            Claude AI 课程
          </div>
        </div>
        <div className="pl-7 font-mono text-[10.5px] leading-tight tracking-wide text-sidebar-foreground-dim">
          ADMIN CONSOLE
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const active = activeKey === item.key;
          const itemCount = counts?.[item.key];
          const count = itemCount !== undefined ? String(itemCount) : "—";
          return (
            <Link
              key={item.key}
              href={item.href}
              data-testid={`nav-${item.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[34px] w-full items-center justify-between gap-2 rounded-token border-0 pr-2.5 text-left font-sans text-[13px]",
                active
                  ? "border-l-2 border-l-[#c9502f] bg-sidebar-active pl-2 font-medium text-sidebar-foreground-bright"
                  : "pl-2.5 font-normal text-sidebar-foreground",
              )}
            >
              <span className="flex min-w-0 items-center gap-[9px]">
                <svg
                  viewBox="0 0 16 16"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-none opacity-85"
                >
                  <path d={item.icon} />
                </svg>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
              </span>
              <span
                className={cn(
                  "flex-none font-mono text-[10.5px] leading-none",
                  active ? "text-[#c9a99a]" : "text-sidebar-foreground-dim",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}

        <div className="mx-2 mb-1.5 mt-3.5 font-mono text-[10px] leading-none tracking-[0.12em] text-sidebar-foreground-dim">
          数据
        </div>
        {/* 此前是个死键：写着「导入 / 同步 · CSV」但点了没反应，因为当时唯一的
            导入路径是本地命令行。现在它有真东西可去了，所以做成真链接。
            名字收窄成「作业 CSV 导入」而不是笼统的「导入 / 同步」——
            报课导入还不存在（阻塞于 EliteCoach101 的导出方式未知），
            用一个大词占位等于承诺一件做不到的事。 */}
        <Link
          href="/homework"
          className="flex h-8 w-full items-center justify-between gap-2 rounded-token px-2.5 text-left font-sans text-[13px] text-sidebar-foreground/80 no-underline hover:bg-sidebar-active"
        >
          <span>作业 CSV 导入</span>
        </Link>
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-sidebar-border px-3.5 py-2.5">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] leading-relaxed text-sidebar-foreground/80">
          yan@jiangwutang.cn
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] leading-relaxed text-sidebar-foreground-dim">
          <span className="h-[5px] w-[5px] flex-none rounded-full bg-success" />
          <span>管理员 · 生产环境</span>
        </div>
      </div>
    </aside>
  );
}
