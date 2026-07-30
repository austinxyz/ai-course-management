"use client";

import { useMemo, useState } from "react";

import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ZONE_ROWS, timeIn, weekdayIn, zoneLine } from "@/lib/tz";
import type { Course, SessionState } from "./types";

interface CoursesClientProps {
  courses: Course[];
  /**
   * 已有场次上出现过的讲师，去重后由后端给出。本组只渲染，排课与编辑在下一组接上——
   * 提前把它接进 props 是为了让页面取数一次到位，不必到时候再改一遍 Server Component。
   */
  teachers: string[];
}

/**
 * 状态 Badge 的配色取自设计脚本。
 *
 * 「待上」是 success 而非默认灰：这一列里真正要被看见的是"还没上、别忘了"，
 * 已上反而是可以忽略的。
 */
const STATE_LABEL: Record<SessionState, { text: string; variant: "success" | "muted" | "danger" }> = {
  pending: { text: "待上", variant: "success" },
  done: { text: "已上", variant: "muted" },
  cancelled: { text: "已取消", variant: "danger" },
};

export function CoursesClient({ courses }: CoursesClientProps) {
  // 只存"选中了谁"，课程数据本身不复制到本地 —— 本地副本会让页面显示从未写入的东西，
  // 学员名单上已经吃过一次这个亏。
  const [selectedId, setSelectedId] = useState<string | null>(courses[0]?.id ?? null);
  const selected = useMemo(
    () => courses.find((c) => c.id === selectedId) ?? courses[0] ?? null,
    [courses, selectedId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-none items-end justify-between gap-5 border-b border-border bg-surface px-[22px] pb-[13px] pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">课程</h1>
            <span className="font-mono text-xs text-muted">{courses.length} 门课</span>
          </div>
          <p className="m-0 font-sans text-[12.5px] text-muted">
            每门课上一次、交一次作业。课程是报课、作业、催作业共用的口径，改这里会影响所有引用它的页面。
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto bg-background p-[22px]">
        {courses.length === 0 ? (
          <Card className="max-w-[640px]">
            <div className="flex flex-col gap-1.5">
              <h3 className="m-0 font-sans text-sm font-semibold">还没有课程</h3>
              <p className="m-0 font-sans text-[13px] leading-relaxed text-muted">
                建一门课之后，报课与作业才有地方挂。
              </p>
            </div>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {courses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => setSelectedId(course.id)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-token border px-3 py-2 text-left",
                    course.id === selected?.id
                      ? "border-primary bg-surface"
                      : "border-border bg-surface-muted",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-sans text-[13px] font-medium text-foreground">
                      {course.name}
                    </span>
                    {course.offline && <Badge variant="muted">已下线</Badge>}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {course.short || "—"} · {course.sessions.length} 场
                  </span>
                </button>
              ))}
            </div>

            {selected && <CourseDetail course={selected} />}
          </>
        )}
      </div>
    </div>
  );
}

function CourseDetail({ course }: { course: Course }) {
  return (
    <div className="flex max-w-[860px] flex-col gap-3.5">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <h2 className="m-0 font-sans text-[17px] font-semibold tracking-tight">
                {course.name}
              </h2>
              {course.offline && <Badge variant="muted">已下线</Badge>}
            </div>
            <p className="m-0 font-sans text-[13px] text-muted">{course.tagline}</p>
            <p className="m-0 font-sans text-[12.5px] leading-relaxed text-foreground/85">
              {course.intro}
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="font-mono text-[11px] tracking-wide text-muted-foreground">平台别名</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {course.aliases.length === 0 ? (
              <span className="font-sans text-xs text-muted-foreground/70">还没有别名</span>
            ) : (
              course.aliases.map((alias) => (
                // 显示用户当初的写法：匹配用的归一化值是后端的事，而人核对平台数据时
                // 找的是自己填过的那个写法。
                <span
                  key={alias.raw}
                  className="inline-flex items-center rounded-token border border-border bg-surface-muted px-2 py-0.5 font-mono text-[11.5px]"
                >
                  {alias.raw}
                </span>
              ))
            )}
          </div>
          <span className="font-sans text-[11.5px] text-muted-foreground">
            导入时按这些写法匹配到本课程
          </span>
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="font-mono text-[11px] tracking-wide text-muted-foreground">这门课</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Fact label="每场时长" value={`${course.hours} 小时`} />
            <Fact label="场次" value={`${course.sessions.length} 场`} />
            <Fact label="简称" value={course.short || "—"} />
          </div>
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-[11px] tracking-wide text-muted-foreground">
              作业 · 一次
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-sans text-[12.5px] text-foreground">
              {course.homework_title || "还没写作业题目"}
            </span>
            <span className="font-sans text-[11.5px] text-muted-foreground">
              截止日期按场次定
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <div className="font-sans text-sm font-semibold">上课时间 · 每场独立讲师与学员</div>
          <span className="font-sans text-[11.5px] text-muted-foreground">
            时间按美西记，下面一行是各时区对应时间
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {course.sessions.length === 0 ? (
            <p className="m-0 font-sans text-[12.5px] leading-relaxed text-muted">
              还没有排课。加一个上课时间后，这门课才会出现在报课的场次选项里。
            </p>
          ) : (
            course.sessions.map((session, index) => (
              <SessionRow key={session.id} session={session} index={index} />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <span className="font-sans text-[12.5px] text-foreground">{value}</span>
    </span>
  );
}

function SessionRow({
  session,
  index,
}: {
  session: Course["sessions"][number];
  index: number;
}) {
  const state = STATE_LABEL[session.state];
  const base = session.tz;

  return (
    <div
      data-session={session.id}
      className="flex flex-col gap-1.5 rounded-token border border-border bg-surface-muted/60 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] text-muted-foreground">第 {index + 1} 场</span>
        <span className="font-mono text-[12.5px] text-foreground">
          {session.local_date} {weekdayIn(session.starts_at, base)}{" "}
          {timeIn(session.starts_at, base)}
        </span>
        <span className="font-sans text-[12.5px] text-foreground">{session.teacher}</span>
        <Badge variant={state.variant}>{state.text}</Badge>
        {session.state_is_override && (
          <span className="font-sans text-[11px] text-muted-foreground">人工设定</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {ZONE_ROWS.filter((row) => row.timeZone !== base).map((row) => (
          <span key={row.timeZone} className="font-mono text-[11px] text-muted-foreground">
            {zoneLine(session.starts_at, base, row)}
          </span>
        ))}
      </div>
      {session.note && (
        <span className="font-sans text-[11.5px] text-muted-foreground">{session.note}</span>
      )}
    </div>
  );
}
