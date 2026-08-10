"use client";

import { useState } from "react";

import { Button } from "@/components/ui";

export interface ManualInteractionCourseOption {
  id: string;
  name: string;
}

export interface ManualInteractionDraft {
  courseId: string;
  channel: "wechat" | "email";
  note: string;
}

interface ManualInteractionModalProps {
  studentName: string;
  /** 该学员已报的课程——过滤在调用方做（`interactions-manual-entry` design.md 决定 2）。 */
  courses: ManualInteractionCourseOption[];
  onSave: (draft: ManualInteractionDraft) => Promise<{ ok: boolean; message?: string }>;
  onClose: () => void;
}

/**
 * 手动录入一条互动记录。外观对齐 `EnrollmentModal.tsx`（design.md 决定 6）。
 */
export function ManualInteractionModal({
  studentName,
  courses,
  onSave,
  onClose,
}: ManualInteractionModalProps) {
  const [courseId, setCourseId] = useState("");
  const [channel, setChannel] = useState<"wechat" | "email">("wechat");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = !!courseId && note.trim().length > 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const result = await onSave({ courseId, channel, note });
    setBusy(false);
    // 关闭只在成功回调里做：写入期间关掉弹窗会把失败信息一起带走。
    if (result.ok) onClose();
    else setError(result.message ?? "没保存上。");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div
        role="dialog"
        aria-label="手动记录互动"
        className="flex w-[400px] max-w-full flex-col gap-3.5 rounded-token border border-border bg-surface p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-sans text-[15px] font-semibold">手动记录互动</h2>
          <p className="m-0 font-sans text-[12.5px] text-muted">
            为 {studentName} 记一条。时间自动取当前时刻。
          </p>
        </div>

        <label className="flex flex-col gap-1 font-sans text-[12.5px]">
          <span className="text-muted-foreground">课程</span>
          <select
            aria-label="课程"
            value={courseId}
            disabled={busy}
            onChange={(e) => setCourseId(e.target.value)}
            className="h-9 rounded-token border border-border bg-background px-2.5 font-sans text-[13px]"
          >
            <option value="">选一门课</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-1 border-none p-0 font-sans text-[12.5px]">
          <legend className="text-muted-foreground">渠道</legend>
          <div className="flex items-center gap-3.5">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="channel"
                checked={channel === "wechat"}
                disabled={busy}
                onChange={() => setChannel("wechat")}
              />
              微信
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="channel"
                checked={channel === "email"}
                disabled={busy}
                onChange={() => setChannel("email")}
              />
              邮件
            </label>
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 font-sans text-[12.5px]">
          <span className="text-muted-foreground">内容</span>
          <textarea
            aria-label="内容"
            rows={3}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="必填，比如「微信里聊了下学习进度」"
            className="rounded-token border border-border bg-background px-2.5 py-2 font-sans text-[13px]"
          />
        </label>

        {error && <span className="font-sans text-[12px] text-danger">{error}</span>}

        <div className="flex justify-end gap-2">
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
