"use client";

import { Button } from "@/components/ui";

interface DeleteConfirmDialogProps {
  summary: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 删除人工录入/参与度信号记录前先弹这个确认框（`interactions-confirm-and-undo`
 * design.md 决定 4）。确认按钮用 danger 变体——跟"确认标记"的 primary 区分开，
 * 避免讲师看错按钮点错（这是不可逆操作，那不是）。 */
export function DeleteConfirmDialog({ summary, busy, error, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div
        role="dialog"
        aria-label="删除这条记录"
        className="flex w-[380px] max-w-full flex-col gap-3.5 rounded-token border border-border bg-surface p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-sans text-[15px] font-semibold">删除这条记录？</h2>
          <p className="m-0 font-sans text-[12.5px] text-muted">{summary}。删除后不能恢复。</p>
        </div>
        {error && <span className="font-sans text-[12px] text-danger">{error}</span>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? "正在删除…" : "删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}
