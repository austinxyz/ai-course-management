"use client";

import { Button } from "@/components/ui";

interface SignalConfirmDialogProps {
  studentName: string;
  signalLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 参与度信号点击后先弹这个确认框，确认后才真正写入
 * （`interactions-confirm-and-undo` design.md 决定 3）。外观对齐既有弹窗
 * 规范（`EnrollmentModal.tsx`）：标题 + 一句话 + 取消/确认两个按钮。写入
 * 失败时 inline 展示错误，不静默吞掉——跟 `DeleteConfirmDialog` 同一套
 * 报错展示方式（design.md Open Questions Q-01 的实现约定）。 */
export function SignalConfirmDialog({
  studentName,
  signalLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: SignalConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div
        role="dialog"
        aria-label="确认标记参与度信号"
        className="flex w-[380px] max-w-full flex-col gap-3.5 rounded-token border border-border bg-surface p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-sans text-[15px] font-semibold">确认标记参与度信号</h2>
          <p className="m-0 font-sans text-[12.5px] text-muted">
            给{studentName}标记「{signalLabel}」？
          </p>
        </div>
        {error && <span className="font-sans text-[12px] text-danger">{error}</span>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? "正在保存…" : "确认"}
          </Button>
        </div>
      </div>
    </div>
  );
}
