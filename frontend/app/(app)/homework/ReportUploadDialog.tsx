"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

import type { ReportPreview } from "./types";

type PreviewOutcome = { ok: true; result: ReportPreview } | { ok: false; message: string };
type ApplyOutcome = { ok: true; result: ReportPreview } | { ok: false; message: string };

/**
 * 失败形状统一。同 `ImportDialog`：预期内的结果用返回值表达，
 * 鉴权/网络失败走抛出——不接的话会变成停在"正在读取…"的未处理 rejection。
 */
async function settle<T extends { ok: boolean }>(
  run: () => Promise<T>,
  fallback: string,
): Promise<T | { ok: false; message: string }> {
  try {
    return await run();
  } catch {
    return { ok: false, message: fallback };
  }
}

interface ReportUploadDialogProps {
  file: File;
  submissionId: string;
  /** 显示用。 */
  personName: string;
  onPreview: (file: File, submissionId: string) => Promise<PreviewOutcome>;
  onApply: (
    file: File,
    submissionId: string,
    acceptedItems: string[],
  ) => Promise<ApplyOutcome>;
  onClose: () => void;
}

/**
 * 批改报告的预览 + 逐分项勾选 + 确认。
 *
 * 跟 `ImportDialog` 同一套两条不可让步的规则：写入期间所有出口禁用（含取消），
 * 失败信息就地渲染、只在成功回调里关闭。
 *
 * 勾选框**默认全部勾选**——得分不一致只是警告，不代表默认不要；
 * 亮点/改进建议不单独勾选，跟着"确认导入"整体生效。
 */
export function ReportUploadDialog(props: ReportUploadDialogProps) {
  const { file, submissionId, personName, onPreview, onApply, onClose } = props;

  const [result, setResult] = useState<ReportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"previewing" | "ready" | "writing">("previewing");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setPhase("previewing");
    setError(null);
    const outcome = await settle(
      () => onPreview(file, submissionId),
      "读不出这份报告的预览，请确认还登录着，然后重试。",
    );
    if (outcome.ok) {
      setResult(outcome.result);
      // 默认全部勾选。
      setChecked(Object.fromEntries(outcome.result.items.map((it) => [it.code, true])));
      setPhase("ready");
      return;
    }
    setResult(null);
    setError(outcome.message);
    setPhase("previewing");
  }, [file, submissionId, onPreview]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = phase === "writing";
  const acceptedItems = useMemo(
    () => Object.entries(checked).filter(([, v]) => v).map(([code]) => code),
    [checked],
  );

  async function confirm() {
    setPhase("writing");
    setError(null);
    const outcome = await settle(
      () => onApply(file, submissionId, acceptedItems),
      "导入没能完成，请确认还登录着，然后重试。",
    );
    if (outcome.ok) {
      onClose();
      return;
    }
    setError(outcome.message);
    setPhase("ready");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/30 p-8">
      <div
        role="dialog"
        aria-label="上传批改报告"
        className="flex w-[480px] flex-col gap-3 rounded-token border border-border bg-surface p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="font-sans text-[15px] font-semibold">上传批改报告 · {personName}</div>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            关闭
          </Button>
        </div>

        {phase === "previewing" && !error && (
          <p className="m-0 font-sans text-[13px] text-muted">正在读取这份报告…</p>
        )}

        {result && (
          <>
            {result.items.some((it) => it.mismatch) || result.totalMismatch ? (
              <div
                data-testid="report-mismatch-banner"
                className="rounded-token border border-warning/40 bg-warning/10 px-3 py-2.5 font-sans text-[12.5px] leading-relaxed"
              >
                <strong>得分与现有记录不一致</strong>
                <br />
                确认导入后亮点/改进建议会用报告里的版本覆盖，分数本身不会被这次上传改变。
              </div>
            ) : null}

            <div className="flex flex-col gap-1 overflow-hidden rounded-token border border-border">
              {result.items.map((it, i) => (
                <label
                  key={it.code}
                  data-testid={`report-item-${it.code}`}
                  className={cn(
                    "flex items-start gap-2 px-2.5 py-1.5 font-sans text-[12px]",
                    i % 2 ? "bg-surface-muted" : "bg-surface",
                    it.mismatch && "bg-warning/10",
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={checked[it.code] ?? true}
                    onChange={(e) =>
                      setChecked((prev) => ({ ...prev, [it.code]: e.target.checked }))
                    }
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono">{it.code}</span>
                      <span className="flex items-center gap-1.5">
                        {it.mismatch && (
                          <span
                            data-testid={`report-mismatch-${it.code}`}
                            className="rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
                          >
                            ⚠ 与现有分数不一致
                          </span>
                        )}
                        <span className="font-mono">
                          {it.score} / {it.max}
                        </span>
                      </span>
                    </span>
                    <span className="text-muted">{it.comment}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
                亮点（将覆盖现有内容）
              </span>
              <p className="m-0 font-sans text-[12.5px] leading-relaxed">{result.highlight || "—"}</p>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
                改进建议（将覆盖现有内容）
              </span>
              <p className="m-0 font-sans text-[12.5px] leading-relaxed">{result.improve || "—"}</p>
            </div>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="m-0 rounded-token border border-danger-border bg-danger-surface px-3 py-2.5 font-sans text-[12.5px] leading-relaxed text-danger"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          {phase !== "previewing" && result && (
            <Button onClick={confirm} disabled={busy}>
              {busy ? "导入中…" : "确认导入"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
