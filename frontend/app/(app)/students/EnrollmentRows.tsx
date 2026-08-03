"use client";

import { useState } from "react";

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

const SOURCE_LABEL: Record<string, string> = {
  manual: "手工补录",
  platform: "平台同步",
  derived: "倒推",
};

export interface SessionOption {
  id: string;
  label: string;
}

export type RowResult = { ok: boolean; message?: string };

interface EnrollmentRowsProps {
  enrollments: Enrollment[];
  /** 每门课可选的场次，按 courseId 取。改场次时只列该课程自己的场次。 */
  sessionsByCourse: Record<string, SessionOption[]>;
  onAdd: () => void;
  onChangeSession: (id: string, sessionId: string | null) => Promise<RowResult>;
  onDelete: (id: string) => Promise<RowResult>;
}

export function EnrollmentRows({
  enrollments,
  sessionsByCourse,
  onAdd,
  onChangeSession,
  onDelete,
}: EnrollmentRowsProps) {
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
          <EnrollmentRow
            key={row.id}
            row={row}
            sessions={sessionsByCourse[row.courseId] ?? []}
            onChangeSession={onChangeSession}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}

/**
 * One record, with its own busy and error state.
 *
 * Per-row rather than shared: several records can be in different states at
 * once, and one shared error line leaves the user unable to tell which one
 * failed to save — the shape the course page's session rows already ran into.
 */
function EnrollmentRow({
  row,
  sessions,
  onChangeSession,
  onDelete,
}: {
  row: Enrollment;
  sessions: SessionOption[];
  onChangeSession: (id: string, sessionId: string | null) => Promise<RowResult>;
  onDelete: (id: string) => Promise<RowResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [draft, setDraft] = useState(row.sessionId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    // 空字符串是 select 的"没选"；接口要的是 null，而 null 在这里是合法值（清空场次）。
    const result = await onChangeSession(row.id, draft || null);
    setBusy(false);
    // 只在成功后收起。失败时留着编辑态——用户刚选的那一场是他花心思做的判断，
    // 收起来就等于让他重做一遍。
    if (result.ok) setEditing(false);
    else setError(result.message ?? "没保存上。");
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await onDelete(row.id);
    setBusy(false);
    if (result.ok) setAskDelete(false);
    else setError(result.message ?? "没删掉。");
  }

  return (
    <div
      data-testid={`enrollment-${row.id}`}
      className="flex flex-col gap-1.5 rounded-token border border-border bg-surface-muted px-3 py-2"
    >
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          {/* 两行再省略，不是单行截断：最长的课程名是
              「AI 炒股分析系统 — 从方法论到可运行 Skill」，两行足够全显示。 */}
          <span className="line-clamp-2 font-sans text-[13px] text-foreground">
            {row.courseName}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {/* 留白读作"没有场次这个概念"，而实际含义是"还得有人给他指派一场"。 */}
            <span className={row.sessionDate ? undefined : "text-primary"}>
              {row.sessionDate ?? "未定场次"}
            </span>
            {" · 报名于 "}
            <span>{row.enrolledAt}</span>
            {" · "}
            <span>{SOURCE_LABEL[row.source] ?? row.source}</span>
          </span>
          {/* 详情看 /homework 页——这里只给一句概要 + 跳转，不展开分项/亮点/改进建议。 */}
          <span className="font-mono text-[11px] text-muted-foreground">
            作业{" "}
            <a
              href={`/homework?course=${row.courseId}&student=${encodeURIComponent(row.studentEmail)}`}
              className={row.homeworkTotal !== null ? "text-primary" : undefined}
            >
              {row.homeworkTotal !== null ? `已交 · ${row.homeworkTotal} 分` : "未交"}
            </a>
          </span>
        </span>
        <span className="flex flex-none items-center gap-1.5">
          <span
            className={cn(
              "rounded-token border px-2 py-0.5 font-sans text-[11.5px]",
              row.state === "withdrawn"
                ? "border-danger-border bg-danger-surface text-danger"
                : "border-border bg-surface text-muted",
            )}
          >
            {STATE_LABEL[row.state] ?? row.state}
          </span>
          {!editing && !askDelete && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                改场次
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAskDelete(true)}>
                删除
              </Button>
            </>
          )}
        </span>
      </div>

      {editing && (
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 font-sans text-[12px]">
            <span className="text-muted-foreground">场次</span>
            <select
              aria-label="场次"
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              className="h-8 flex-1 rounded-token border border-border bg-background px-2 font-sans text-[12.5px]"
            >
              <option value="">未定场次</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" size="sm" onClick={save} disabled={busy}>
            {busy ? "正在保存…" : "保存"}
          </Button>
          {/* 取消也在写入期间禁用：中途收起会把失败信息一起带走。 */}
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={busy}>
            取消
          </Button>
        </div>
      )}

      {askDelete && (
        <div className="flex items-center gap-2">
          <span className="flex-1 font-sans text-[12px] text-muted">
            删掉这条报课？退课请用「退课」，删除是给录错的记录用的。
          </span>
          <Button variant="danger" size="sm" onClick={remove} disabled={busy}>
            {busy ? "正在删除…" : "确认删除"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAskDelete(false)} disabled={busy}>
            取消
          </Button>
        </div>
      )}

      {error && <span className="font-sans text-[11.5px] text-danger">{error}</span>}
    </div>
  );
}
