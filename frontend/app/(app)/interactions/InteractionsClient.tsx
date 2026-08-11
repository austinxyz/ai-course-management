"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatAt, channelLabel } from "@/lib/format";
import { ManualEntryPanel, type ManualEntryEnrollment, type ManualEntryStudentOption } from "./ManualEntryPanel";
import { SOURCE_LABEL, sourceCategory, typeLabel, type ManualType, type ParticipationSignal } from "./labels";
import type { Interaction } from "./types";

/** 互动记录独立页——来源 tab + 搜索框筛选（design.md 决定 3），常驻"记一条"
 * 面板手动录入 + 参与度信号（design.md 决定 5、7）。不做分页——当前数据量级
 * 不需要（`interactions` design.md Non-Goals）。 */

type SourceTab = "all" | "auto" | "manual" | "participation";

const TABS: { key: SourceTab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "auto", label: "系统自动" },
  { key: "manual", label: "人工录入" },
  { key: "participation", label: "参与度" },
];

function sourceBadgeVariant(cat: ReturnType<typeof sourceCategory>): "muted" | "default" | "success" {
  if (cat === "auto") return "muted";
  if (cat === "participation") return "success";
  return "default";
}

/** 归属列——手动录入与参与度信号固定"Austin"（design.md 决定），系统自动
 * 事件里"已催"沿用既有渠道展示，跳过/取消跳过没有渠道可展示。 */
function byFor(i: Interaction): string {
  const cat = sourceCategory(i.eventType);
  if (cat === "manual" || cat === "participation") return "Austin";
  if (i.eventType === "nudged") return channelLabel(i.channel);
  return "—";
}

function matchesQuery(i: Interaction, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    i.studentName.toLowerCase().includes(q) ||
    i.studentEmail.toLowerCase().includes(q) ||
    typeLabel(i.eventType, i.channel).toLowerCase().includes(q) ||
    i.note.toLowerCase().includes(q)
  );
}

interface InteractionsClientProps {
  interactions: Interaction[];
  students?: ManualEntryStudentOption[];
  enrollments?: ManualEntryEnrollment[];
  initialQuery?: string;
  onSubmitManual?: (draft: { studentEmail: string; type: ManualType; note: string }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  onSubmitSignal?: (draft: { studentEmail: string; signal: ParticipationSignal }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
}

async function noopWrite() {
  return { ok: false, message: "没配置写入口" };
}

export function InteractionsClient({
  interactions,
  students = [],
  enrollments = [],
  initialQuery,
  onSubmitManual = noopWrite,
  onSubmitSignal = noopWrite,
}: InteractionsClientProps) {
  const [tab, setTab] = useState<SourceTab>("all");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [toast, setToast] = useState<string | null>(null);

  const counts = useMemo(() => {
    const result: Record<SourceTab, number> = { all: interactions.length, auto: 0, manual: 0, participation: 0 };
    for (const i of interactions) result[sourceCategory(i.eventType)]++;
    return result;
  }, [interactions]);

  const filtered = useMemo(() => {
    return interactions
      .filter((i) => tab === "all" || sourceCategory(i.eventType) === tab)
      .filter((i) => matchesQuery(i, query))
      .sort((a, b) => (a.at > b.at ? -1 : 1));
  }, [interactions, tab, query]);

  function handleWritten() {
    setToast("这条互动记录已经加进去了。");
  }

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-none items-end justify-between gap-5 border-b border-border bg-surface px-[22px] pb-[13px] pt-4">
          <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">互动记录</h1>
          <label className="flex h-[34px] w-[236px] flex-none items-center gap-1.5 rounded-token border border-border bg-surface px-2.5">
            <span className="sr-only">搜学员、类型或内容</span>
            <input
              aria-label="搜学员、类型或内容"
              type="text"
              placeholder="搜学员、类型或内容"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent font-sans text-[12.5px] outline-none"
            />
          </label>
        </header>

        <div className="flex flex-none flex-wrap items-center gap-3 border-b border-border bg-surface-muted px-[22px] py-2.5">
          <div className="flex gap-0.5 rounded-token border border-border bg-surface-muted p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex h-[28px] items-center gap-1.5 rounded px-2.5 font-sans text-xs",
                  tab === t.key ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted",
                )}
              >
                {t.label}
                <span className="font-mono text-[11px] text-muted-foreground">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <span className="max-w-[520px] font-sans text-xs text-muted">
            作业提交、批改完成、催促已发、新报课由事件自动写入；1:1 沟通和参与度信号手工录。
          </span>
        </div>

        {toast && (
          <div className="flex flex-none items-center gap-2.5 border-b border-[#d6e6dc] bg-[#f2f8f4] px-[22px] py-2.5">
            <Badge variant="success">已写入</Badge>
            <span className="font-sans text-[12.5px]">{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-auto h-[26px] rounded-token border border-[#d6e6dc] bg-surface px-2.5 font-sans text-xs text-muted"
            >
              知道了
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-surface">
          {filtered.length === 0 ? (
            <p className="m-0 p-[22px] font-sans text-[13px] leading-relaxed text-muted">
              没有符合条件的记录。
            </p>
          ) : (
            filtered.map((i, idx) => {
              const cat = sourceCategory(i.eventType);
              return (
                <div
                  key={`${i.studentEmail}-${i.at}-${idx}`}
                  data-testid={`interaction-row-${i.studentEmail}-${i.at}`}
                  className="flex items-start gap-3 border-b border-border px-[22px] py-3 font-sans text-[12.5px]"
                >
                  <Badge variant={sourceBadgeVariant(cat)}>{SOURCE_LABEL[cat]}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{typeLabel(i.eventType, i.channel)}</span>
                      <span className="text-muted">{i.studentName}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{i.studentEmail}</span>
                    </div>
                    {i.note && <p className="m-0 mt-1 leading-relaxed text-foreground">{i.note}</p>}
                  </div>
                  <div className="flex w-[110px] flex-none flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px] text-muted-foreground">{formatAt(i.at)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{byFor(i)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      <ManualEntryPanel
        students={students}
        enrollments={enrollments}
        onSubmitManual={onSubmitManual}
        onSubmitSignal={onSubmitSignal}
        onWritten={handleWritten}
      />
    </div>
  );
}
