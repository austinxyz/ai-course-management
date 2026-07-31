"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import type { HomeworkCourse, HomeworkPerson } from "./types";

/**
 * 作业页：`grades.csv` 的**只读**镜像。
 *
 * 页面上没有任何写入控件。源文件由批改流程生成并由人维护，两边都能写就会分叉，
 * 而分叉之后没有哪一边有资格当准。稿子上那个「重新同步 grades.csv」按钮更是
 * 做不出来——文件在另一个仓库，部署环境的后端根本看不到它。
 */

/** 四态。三态不够：没有场次就没有截止时间，催他是冤的。 */
/**
 * 四态。三态不够：没有场次就没有截止时间，催他是冤的。
 *
 * `tone` 是这一列唯一的语气，所以三种"没交"不能共用同一个颜色：
 * 「未交」是真的欠着（danger），「未定场次」是**我方**还有事没做（primary，
 * 与报课页同一套语言），「未开放」则完全正常（muted）。
 * 一律用红的话，一屏未开放会读起来像出事了。
 */
const STATE = {
  submitted: { label: "已交", dot: "bg-success", tone: "text-foreground", note: "" },
  missing: { label: "未交", dot: "bg-danger", tone: "text-danger", note: "有报课无提交" },
  not_open: {
    label: "未开放",
    dot: "bg-muted-foreground",
    tone: "text-muted",
    note: "场次还没上",
  },
  no_session: {
    label: "未定场次",
    dot: "bg-primary",
    tone: "text-primary",
    note: "先指派场次",
  },
} as const;

type Filter = "all" | "submitted" | "missing" | "pending_reply";

/**
 * 待回复 = 已交，且回复状态**不等于**「已回复」。
 *
 * 用不等号而不是列一张"待回复的取值"清单：回复状态原样取自源文件，
 * 实测取值是「待回复」「草稿已创建」，而将来还会有别的写法。
 * 只有「已回复」这一个值有确定含义，其余一律算还欠一句回复。
 */
function awaitingReply(person: HomeworkPerson): boolean {
  return person.state === "submitted" && person.replyStatus !== "已回复";
}

const MATCHES: Record<Filter, (p: HomeworkPerson) => boolean> = {
  all: () => true,
  submitted: (p) => p.state === "submitted",
  missing: (p) => p.state === "missing",
  pending_reply: awaitingReply,
};

interface HomeworkClientProps {
  courses: HomeworkCourse[];
  courseId: string;
  people: HomeworkPerson[];
}

export function HomeworkClient({ courses, courseId, people }: HomeworkClientProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: people.length,
      submitted: people.filter(MATCHES.submitted).length,
      missing: people.filter(MATCHES.missing).length,
      pending_reply: people.filter(MATCHES.pending_reply).length,
    }),
    [people],
  );

  const rows = people.filter(MATCHES[filter]);
  const current = rows.find((p) => p.studentEmail === selected) ?? null;
  const course = courses.find((c) => c.id === courseId);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-none flex-col gap-2.5 border-b border-border bg-surface px-[22px] pb-[13px] pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">作业</h1>
            <span className="font-mono text-xs text-muted">
              {course ? course.name : "还没有课程"}
            </span>
          </div>
          <p className="m-0 font-sans text-[12.5px] text-muted">
            grades.csv 的只读镜像。改成绩要回 ai-course 仓库改 csv，再跑一次
            tools/homework-sync。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/homework?course=${c.id}`}
              className={cn(
                "inline-flex h-[26px] items-center whitespace-nowrap rounded-token border px-2.5 font-sans text-xs no-underline",
                c.id === courseId
                  ? "border-primary bg-primary font-medium text-primary-foreground"
                  : "border-border bg-surface text-foreground",
              )}
            >
              {c.short || c.name}
            </Link>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto bg-background p-[22px]">
          {people.length === 0 ? (
            <p className="m-0 rounded-token border border-dashed border-border bg-surface-muted px-4 py-6 text-center font-sans text-[13px] leading-relaxed text-muted">
              这门课还没有任何报课记录。名单来自报课——先在学员详情里补录，
              这一页才有人可列。
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                  全部 {counts.all}
                </FilterChip>
                <FilterChip
                  active={filter === "submitted"}
                  onClick={() => setFilter("submitted")}
                >
                  已交 {counts.submitted}
                </FilterChip>
                <FilterChip active={filter === "missing"} onClick={() => setFilter("missing")}>
                  未交 {counts.missing}
                </FilterChip>
                <FilterChip
                  active={filter === "pending_reply"}
                  onClick={() => setFilter("pending_reply")}
                >
                  待回复 {counts.pending_reply}
                </FilterChip>
              </div>

              {counts.submitted === 0 && (
                <p className="m-0 rounded-token border border-dashed border-border bg-surface-muted px-3 py-2.5 font-sans text-[12.5px] leading-relaxed text-muted">
                  这门课还没有任何提交记录。如果作业已经批过了，跑一次{" "}
                  <code className="font-mono text-[11.5px]">
                    tools/homework-sync/sync.py --course {course?.short || "S?"} …
                  </code>
                </p>
              )}

              {/* flex-none 不能省：外框上的 overflow-hidden 是为了圆角，但它同时是个
                  会被压缩的 flex 子项——被挤扁后它把超出的行**裁掉**，而外层滚动容器
                  因此看不到任何溢出，于是哪儿都没有滚动条。S1 有 17 行，够撞上。 */}
              <div className="flex-none overflow-hidden rounded-token border border-border bg-surface">
                <table className="w-full border-collapse font-sans text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted text-left">
                      <Th>学员</Th>
                      <Th>提交时间</Th>
                      <Th>总分</Th>
                      <Th>回复</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const meta = STATE[p.state as keyof typeof STATE];
                      return (
                        <tr
                          key={p.studentEmail}
                          data-testid={`homework-${p.studentEmail}`}
                          onClick={() => setSelected(p.studentEmail)}
                          className={cn(
                            "cursor-pointer border-b border-border last:border-b-0",
                            p.state === "missing" ? "bg-danger-surface" : "bg-surface",
                            p.studentEmail === selected && "shadow-[inset_2px_0_0_var(--color-primary)]",
                          )}
                        >
                          <Td>
                            <span className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1.5">
                                <span
                                  data-testid="state-dot"
                                  className={cn(
                                    "inline-block h-1.5 w-1.5 flex-none rounded-full",
                                    meta?.dot ?? "bg-muted-foreground",
                                  )}
                                />
                                {p.name}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {p.studentEmail}
                              </span>
                            </span>
                          </Td>
                          <Td>
                            <span className="flex flex-col gap-0.5">
                              <span
                                data-testid="state-label"
                                className={cn(
                                  "font-mono text-[11.5px]",
                                  meta?.tone ?? "text-foreground",
                                )}
                              >
                                {p.submittedAt ?? meta?.label}
                              </span>
                              {!p.submittedAt && meta?.note && (
                                <span className="font-sans text-[11px] text-muted-foreground">
                                  {meta.note}
                                </span>
                              )}
                            </span>
                          </Td>
                          <Td>
                            <span className="font-mono text-[12.5px]">
                              {/* 没交的人是「—」，不是 0 —— 0 是一个真实的分数 */}
                              {p.total ?? "—"}
                            </span>
                          </Td>
                          <Td>
                            <span className="text-muted-foreground">
                              {p.replyStatus || "—"}
                            </span>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {current && <DetailPanel person={current} courseName={course?.name ?? ""} />}
      </div>
    </main>
  );
}

function DetailPanel({ person, courseName }: { person: HomeworkPerson; courseName: string }) {
  const meta = STATE[person.state as keyof typeof STATE];
  return (
    <aside
      data-testid="homework-detail"
      className="flex w-[420px] flex-none flex-col gap-3 overflow-y-auto border-l border-border bg-surface p-[18px]"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-sans text-[15px] font-semibold">{person.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {person.studentEmail}
        </span>
        <span className="font-sans text-[12px] text-muted">{courseName}</span>
      </div>

      {person.total === null ? (
        <div className="flex flex-col gap-1.5 rounded-token border border-dashed border-border bg-surface-muted px-3 py-2.5">
          <span className="font-sans text-[12.5px] text-foreground">
            {person.state === "missing"
              ? "课已上完，还没交。"
              : person.state === "no_session"
                ? "还没定场次，所以还谈不上交没交——先指派场次。"
                : "场次还没上，现在没有提交是正常的。"}
          </span>
          {/* 催作业要用微信，而微信号是人工对齐的属性，常常是空的。
              这一句现在只是提示；催作业那一片会用到它。 */}
          <span className="font-sans text-[11.5px] text-muted">
            {person.wechat
              ? `微信 ${person.wechat} 已对齐，可以直接私聊。`
              : "这位学员的微信还没对齐，只能走邮件。"}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-[26px] leading-none">{person.total}</span>
            {/* 只有名次，没有满分——满分不在 grades.csv 里 */}
            {person.rank !== null && (
              <span className="font-mono text-[11.5px] text-muted-foreground">
                本课第 {person.rank} / {person.rankOf}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
              分项 {person.scores.length} 项 · 原始分
            </span>
            <div className="overflow-hidden rounded-token border border-border">
              {person.scores.map((s, i) => (
                <div
                  key={s.item}
                  data-testid={`score-${s.item}`}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 font-sans text-[12px]",
                    i % 2 ? "bg-surface-muted" : "bg-surface",
                  )}
                >
                  <span>{s.item}</span>
                  {/* 原始分，没有 `/满分`：满分不在源文件里 */}
                  <span className="font-mono">{s.score}</span>
                </div>
              ))}
            </div>
          </div>

          <Field label="亮点">{person.highlight || "—"}</Field>
          <Field label="改进建议">{person.improve || "—"}</Field>
          <Field label="回复状态">{person.replyStatus || "—"}</Field>

          {/* 来源单独成一个节点：出问题时要能整段复制回源仓库去核，
              跟提交日期拼在一起就复制不干净了。 */}
          <span className="font-mono text-[11px] text-muted-foreground">
            <span>{person.sourceRef}</span>
            {person.submittedAt && <span> · 提交于 {person.submittedAt}</span>}
          </span>
        </>
      )}

      {meta && person.total !== null && (
        <span className="font-mono text-[11px] text-muted-foreground">{meta.label}</span>
      )}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-sans text-[12.5px] leading-relaxed">{children}</span>
    </div>
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
