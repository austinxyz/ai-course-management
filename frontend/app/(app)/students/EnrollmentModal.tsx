"use client";

import { useState } from "react";

import { Button } from "@/components/ui";

export interface EnrollmentCourseOption {
  id: string;
  name: string;
  offline: boolean;
  sessions: { id: string; label: string }[];
}

export interface EnrollmentDraft {
  courseId: string;
  sessionId: string | null;
  enrolledAt: string;
  note: string;
}

interface EnrollmentModalProps {
  studentName: string;
  courses: EnrollmentCourseOption[];
  today: string;
  onSave: (draft: EnrollmentDraft) => Promise<{ ok: boolean; message?: string }>;
  onClose: () => void;
}

/**
 * Manual enrolment entry.
 *
 * Every field the form collects is forwarded, not just the required two — the
 * backend defaults the rest, so dropping them fails silently and only shows up
 * as "the note I typed never saved".
 */
export function EnrollmentModal({
  studentName,
  courses,
  today,
  onSave,
  onClose,
}: EnrollmentModalProps) {
  // 已下线 = 不再招生，所以不作为新建的选项；既有报课照常显示（在别处）。
  const options = courses.filter((c) => !c.offline);

  const [courseId, setCourseId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [enrolledAt, setEnrolledAt] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessions = options.find((c) => c.id === courseId)?.sessions ?? [];
  const canSave = !!courseId && !!enrolledAt && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const result = await onSave({
      courseId,
      // 空字符串是 select 的"没选"，落到接口上要是 null 而不是空串。
      sessionId: sessionId || null,
      enrolledAt,
      note,
    });
    setBusy(false);
    // 关闭只在成功回调里做：写入期间关掉弹窗会把失败信息一起带走。
    if (result.ok) onClose();
    else setError(result.message ?? "没保存上。");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div
        role="dialog"
        aria-label="补录报课"
        className="flex w-[440px] max-w-full flex-col gap-3.5 rounded-token border border-border bg-surface p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-sans text-[15px] font-semibold">补录报课</h2>
          <p className="m-0 font-sans text-[12.5px] text-muted">
            为 {studentName} 记一条。平台漏记、线下转账这类都走这里。
          </p>
        </div>

        <label className="flex flex-col gap-1 font-sans text-[12.5px]">
          <span className="text-muted-foreground">课程</span>
          <select
            aria-label="课程"
            value={courseId}
            disabled={busy}
            onChange={(e) => {
              setCourseId(e.target.value);
              // 换课程时旧场次不再属于它——留着会送出一个跨课程的场次。
              setSessionId("");
            }}
            className="h-9 rounded-token border border-border bg-background px-2.5 font-sans text-[13px]"
          >
            <option value="">选一门课</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 font-sans text-[12.5px]">
          <span className="text-muted-foreground">场次</span>
          <select
            aria-label="场次"
            value={sessionId}
            disabled={busy || !courseId}
            onChange={(e) => setSessionId(e.target.value)}
            className="h-9 rounded-token border border-border bg-background px-2.5 font-sans text-[13px]"
          >
            <option value="">还没定（之后再指派）</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 font-sans text-[12.5px]">
          <span className="text-muted-foreground">报课日期</span>
          <input
            aria-label="报课日期"
            type="date"
            value={enrolledAt}
            disabled={busy}
            onChange={(e) => setEnrolledAt(e.target.value)}
            className="h-9 rounded-token border border-border bg-background px-2.5 font-sans text-[13px]"
          />
        </label>

        <label className="flex flex-col gap-1 font-sans text-[12.5px]">
          <span className="text-muted-foreground">备注</span>
          <textarea
            aria-label="备注"
            rows={2}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-token border border-border bg-background px-2.5 py-2 font-sans text-[13px]"
          />
        </label>

        {error && <span className="font-sans text-[12px] text-danger">{error}</span>}

        <div className="flex justify-end gap-2">
          {/* 取消也在写入期间禁用：中途关掉会把失败信息一起带走。 */}
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!canSave}>
            {busy ? "正在保存…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
