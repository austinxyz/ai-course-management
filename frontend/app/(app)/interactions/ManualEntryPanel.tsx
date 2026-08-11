"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  MANUAL_TYPES,
  MANUAL_TYPE_LABEL,
  PARTICIPATION_SIGNALS,
  SIGNAL_LABEL,
  type ManualType,
  type ParticipationSignal,
} from "./labels";

export interface ManualEntryStudentOption {
  email: string;
  name: string;
}

export interface ManualEntryEnrollment {
  studentEmail: string;
  state: string;
}

type WriteResult = { ok: boolean; message?: string };

interface ManualEntryPanelProps {
  students: ManualEntryStudentOption[];
  /** 只需要 `studentEmail`/`state` 两个字段来判断"该学员有没有有效报课"。 */
  enrollments: ManualEntryEnrollment[];
  onSubmitManual: (draft: { studentEmail: string; type: ManualType; note: string }) => Promise<WriteResult>;
  /** 点信号按钮不直接写入——把"待确认"这个意图抛给父组件，父组件弹确认
   * 弹窗，确认后才真正调用写入接口（`interactions-confirm-and-undo`
   * design.md 决定 5）。 */
  onRequestSignal: (draft: { studentEmail: string; signal: ParticipationSignal }) => void;
  /** 写入成功后调用——父组件用来弹"已写入"提示条。手动录入还是在这个
   * 组件里直接写入（不用确认），信号的写入结果由父组件另外触发。 */
  onWritten: () => void;
}

/**
 * 常驻的"记一条"面板：手动录入表单 + 参与度信号快捷打标，共享同一个学员
 * 选择（design.md 决定 7）。课程不在这里选——后端自动推导，选不到有效报课
 * 的学员时两块入口都禁用（spec"没有有效报课时提交入口被禁用"）。
 */
export function ManualEntryPanel({
  students,
  enrollments,
  onSubmitManual,
  onRequestSignal,
  onWritten,
}: ManualEntryPanelProps) {
  const [studentEmail, setStudentEmail] = useState("");
  const [type, setType] = useState<ManualType>("1on1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasActiveEnrollment = enrollments.some(
    (e) => e.studentEmail === studentEmail && e.state !== "withdrawn",
  );
  const noValidCourse = !!studentEmail && !hasActiveEnrollment;
  const canSave = !!studentEmail && hasActiveEnrollment && note.trim().length > 0 && !busy;
  const signalsDisabled = !studentEmail || !hasActiveEnrollment;

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const result = await onSubmitManual({ studentEmail, type, note });
    setBusy(false);
    if (result.ok) {
      setNote("");
      onWritten();
    } else {
      setError(result.message ?? "没保存上。");
    }
  }

  function clickSignal(signal: ParticipationSignal) {
    if (signalsDisabled) return;
    onRequestSignal({ studentEmail, signal });
  }

  return (
    <aside className="flex w-[360px] flex-none flex-col overflow-y-auto border-l border-border bg-surface">
      <div className="flex flex-col gap-1.5 border-b border-border px-5 py-3.5">
        <h2 className="m-0 font-sans text-[15px] font-semibold">记一条</h2>
        <span className="font-sans text-xs text-muted">选人、选类型、写内容。原文原样存进流水。</span>
      </div>

      <div className="flex flex-col gap-4 px-5 py-3.5">
        <label className="flex flex-col gap-1.5 font-sans text-xs">
          <span className="font-mono tracking-wide text-muted-foreground">学员</span>
          <select
            aria-label="学员"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            className="h-[34px] rounded-token border border-border bg-surface px-2.5 font-sans text-[12.5px]"
          >
            <option value="">选择学员</option>
            {students.map((s) => (
              <option key={s.email} value={s.email}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {noValidCourse && (
          <p className="m-0 font-sans text-[12px] text-danger">
            这名学员没有在读课程，没法记录互动。
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-xs tracking-wide text-muted-foreground">类型</span>
          <div className="flex flex-wrap gap-0.5 self-start rounded-token border border-border bg-surface-muted p-0.5">
            {MANUAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "h-[26px] rounded px-2.5 font-sans text-xs",
                  t === type ? "bg-primary font-medium text-primary-foreground" : "text-muted",
                )}
              >
                {MANUAL_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5 font-sans text-xs">
          <span className="font-mono tracking-wide text-muted-foreground">内容</span>
          <textarea
            aria-label="内容"
            rows={4}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例：聊了 25 分钟，她想把周报流程推给整个运营组，问要不要做一次内训。"
            className="rounded-token border border-border bg-background px-2.5 py-2 font-sans text-[12.5px] leading-relaxed"
          />
        </label>

        <Button variant="primary" size="sm" className="self-start" disabled={!canSave} onClick={submit}>
          {busy ? "正在保存…" : "追加这条"}
        </Button>

        {error && <span className="font-sans text-[12px] text-danger">{error}</span>}

        <div className="flex flex-col gap-1.5 border-t border-dashed border-border pt-3.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs tracking-wide text-muted-foreground">参与度信号</span>
            <span className="font-sans text-[11px] text-muted-foreground">按人工标记</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PARTICIPATION_SIGNALS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={signalsDisabled}
                onClick={() => clickSignal(s)}
                className="h-[28px] rounded-full border border-border bg-surface px-2.5 font-sans text-xs text-muted disabled:opacity-40"
              >
                {SIGNAL_LABEL[s]}
              </button>
            ))}
          </div>
          <span className="font-sans text-[11.5px] text-muted-foreground">
            标给上面识别出的那位学员。
          </span>
        </div>
      </div>
    </aside>
  );
}
