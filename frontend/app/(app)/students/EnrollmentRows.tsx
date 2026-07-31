"use client";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Enrollment } from "./types";

/**
 * State labels only. The state itself is decided by the server.
 *
 * The frontend must not work it out from the session date: anything a client
 * can compute for itself is not a property of the data, and two copies of the
 * same rule drift apart at some boundary — a cancelled sitting, say, whose date
 * has passed but whose class never happened.
 */
const STATE_LABEL: Record<string, string> = {
  enrolled: "报名",
  completed: "已完成",
  withdrawn: "退课",
};

interface EnrollmentRowsProps {
  enrollments: Enrollment[];
  onAdd: () => void;
}

export function EnrollmentRows({ enrollments, onAdd }: EnrollmentRowsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-[11px] tracking-wide text-muted-foreground">
          报课记录
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] text-muted-foreground">
            {enrollments.length ? `${enrollments.length} 条` : "无"}
          </span>
          <Button variant="ghost" size="sm" className="text-primary" onClick={onAdd}>
            补录报课
          </Button>
        </div>
      </div>

      {enrollments.length === 0 ? (
        <p className="m-0 rounded-token border border-dashed border-border bg-surface-muted px-3 py-2.5 font-sans text-[12.5px] leading-relaxed text-muted">
          还没有报课记录。可以先手工补录一条。
        </p>
      ) : (
        enrollments.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-2.5 rounded-token border border-border bg-surface-muted px-3 py-2"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[13px] text-foreground">
                {row.courseName}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {/* 留白读作"没有场次这个概念"，而实际含义是"还得有人给他指派一场"。
                    单独成元素而不是拼进一句话：这是要被找到、被处理的一批人。 */}
                <span className={row.sessionDate ? undefined : "text-primary"}>
                  {row.sessionDate ?? "未定场次"}
                </span>
                {" · 报名于 "}
                <span>{row.enrolledAt}</span>
              </span>
            </span>
            <span
              className={cn(
                "flex-none rounded-token border px-2 py-0.5 font-sans text-[11.5px]",
                row.state === "withdrawn"
                  ? "border-danger-border bg-danger-surface text-danger"
                  : "border-border bg-surface text-muted",
              )}
            >
              {STATE_LABEL[row.state] ?? row.state}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
