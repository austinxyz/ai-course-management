"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import type { Enrollment } from "@/app/(app)/students/types";

const STATE_LABEL: Record<string, string> = {
  enrolled: "报名",
  completed: "已完成",
  withdrawn: "退课",
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "手工补录",
  platform: "平台同步",
  derived: "倒推",
};

interface EnrollClientProps {
  enrollments: Enrollment[];
  /** 邮箱 → 姓名。报课记录只带邮箱，姓名在学员那边。 */
  namesByEmail: Record<string, string>;
}

/**
 * 报课总表：**只读**。
 *
 * 报课记录散在各个学员详情里，没有任何地方能回答"一共多少条""谁还没定场次"。
 * 这一页回答那个问题，而改动仍只在学员详情一处——同一件事有两条写入路径，
 * 两边会慢慢长出不同的校验。
 */
export function EnrollClient({ enrollments, namesByEmail }: EnrollClientProps) {
  const [courseId, setCourseId] = useState<string | null>(null);

  const courses = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of enrollments) seen.set(row.courseId, row.courseName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [enrollments]);

  const rows = courseId ? enrollments.filter((r) => r.courseId === courseId) : enrollments;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-none items-end justify-between gap-5 border-b border-border bg-surface px-[22px] pb-[13px] pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">报课</h1>
            <span className="font-mono text-xs text-muted">{rows.length} 条</span>
          </div>
          <p className="m-0 font-sans text-[12.5px] text-muted">
            这一页只看，不改。补录与修改在学员详情里。
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-background p-[22px]">
        {enrollments.length === 0 ? (
          <p className="m-0 rounded-token border border-dashed border-border bg-surface-muted px-4 py-6 text-center font-sans text-[13px] leading-relaxed text-muted">
            还没有任何报课记录。可以在学员详情里补录，或跑一次倒推脚本。
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip active={courseId === null} onClick={() => setCourseId(null)}>
                全部 {enrollments.length}
              </FilterChip>
              {courses.map((c) => (
                <FilterChip
                  key={c.id}
                  active={courseId === c.id}
                  onClick={() => setCourseId(c.id)}
                >
                  {c.name} {enrollments.filter((r) => r.courseId === c.id).length}
                </FilterChip>
              ))}
            </div>

            <div className="overflow-hidden rounded-token border border-border bg-surface">
              <table className="w-full border-collapse font-sans text-[12.5px]">
                <thead>
                  <tr className="border-b border-border bg-surface-muted text-left">
                    <Th>学员</Th>
                    <Th>课程 · 场次</Th>
                    <Th>报课日期</Th>
                    <Th>状态</Th>
                    <Th>来源</Th>
                    <Th>备注</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      data-testid={`enroll-row-${row.id}`}
                      className="border-b border-border last:border-b-0"
                    >
                      <Td>
                        <span className="flex flex-col gap-0.5">
                          <span>{namesByEmail[row.studentEmail] ?? "—"}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {row.studentEmail}
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <span className="flex flex-col gap-0.5">
                          <span>{row.courseName}</span>
                          {/* 倒推进来的记录全是未定场次，所以这不是边缘情况，
                              而是这一页的主要内容——要能一眼扫到。 */}
                          <span
                            className={cn(
                              "font-mono text-[11px]",
                              row.sessionDate ? "text-muted-foreground" : "text-primary",
                            )}
                          >
                            {row.sessionDate ?? "未定场次"}
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[11.5px] text-muted-foreground">
                          {row.enrolledAt}
                        </span>
                      </Td>
                      <Td>{STATE_LABEL[row.state] ?? row.state}</Td>
                      <Td>{SOURCE_LABEL[row.source] ?? row.source}</Td>
                      <Td>
                        <span className="text-muted-foreground">{row.note || "—"}</span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-[26px] items-center whitespace-nowrap rounded-token border px-2.5 font-sans text-xs",
        active
          ? "border-primary bg-primary font-medium text-primary-foreground"
          : "border-border bg-surface text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-mono text-[11px] font-normal tracking-wide text-muted-foreground">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}
