"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { channelLabel, formatAt } from "@/lib/format";
import type { Interaction } from "./types";

/** 全部互动记录页——纯只读聚合视图，数据一次性整体取回，筛选全部在客户端
 * 完成（design.md 决定 1）。不做分页——当前数据量级不需要（design.md
 * Non-Goals）。 */

type Preset = "today" | "7d" | "30d" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "7d", label: "最近 7 天" },
  { key: "30d", label: "最近 30 天" },
  { key: "custom", label: "自定义" },
];

const EVENT_LABEL: Record<string, string> = {
  nudged: "已催",
  skipped: "跳过",
  unskipped: "取消跳过",
};

function eventBadgeVariant(eventType: string): "default" | "muted" | "success" {
  if (eventType === "skipped") return "muted";
  if (eventType === "unskipped") return "success";
  return "default";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 今天的本地零点——"今天"预设是"从今天零点到现在"，不是"过去 0 天"
 * （那样算出来的窗口起点等于现在，会把今天所有已发生的事件都排除掉，
 * 独立评审在 group-2 抓到的真 bug）。 */
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function withinPreset(at: string, preset: Preset | null, from: string, to: string): boolean {
  if (preset === null) return true;
  const when = new Date(at).getTime();
  if (preset === "custom") {
    const fromTime = from ? new Date(from).getTime() : -Infinity;
    // 结束日期是"含当天"，所以取到那天的最后一刻。
    const toTime = to ? new Date(to).getTime() + DAY_MS : Infinity;
    return when >= fromTime && when < toTime;
  }
  const since = preset === "today" ? startOfToday() : Date.now() - (preset === "7d" ? 7 : 30) * DAY_MS;
  return when >= since;
}

interface InteractionsClientProps {
  interactions: Interaction[];
  initialStudent?: string;
}

export function InteractionsClient({ interactions, initialStudent }: InteractionsClientProps) {
  const [student, setStudent] = useState(initialStudent ?? "");
  // 默认不筛选——spec 明确要求"不做任何筛选"时展示全部学员的互动记录，
  // 不是预选中某个时间预设（独立评审在 group-2 抓到的真 bug：曾经默认选中
  // "最近 7 天"，讲师第一次打开页面看到的就不是"全部"）。
  const [preset, setPreset] = useState<Preset | null>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const studentOptions = useMemo(() => {
    const byEmail = new Map<string, string>();
    for (const i of interactions) byEmail.set(i.studentEmail, i.studentName);
    return [...byEmail.entries()].map(([email, name]) => ({ email, name }));
  }, [interactions]);

  const filtered = useMemo(() => {
    return interactions
      .filter((i) => !student || i.studentEmail === student)
      .filter((i) => withinPreset(i.at, preset, customFrom, customTo))
      .sort((a, b) => (a.at > b.at ? -1 : 1));
  }, [interactions, student, preset, customFrom, customTo]);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-none flex-col gap-2.5 border-b border-border bg-surface px-[22px] pb-[13px] pt-4">
        <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">互动记录</h1>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 font-sans text-xs text-muted">
            按学员筛选
            <select
              aria-label="按学员筛选"
              value={student}
              onChange={(e) => setStudent(e.target.value)}
              className="h-[30px] rounded-token border border-border bg-surface px-2.5 font-sans text-[12.5px]"
            >
              <option value="">全部学员</option>
              {studentOptions.map((s) => (
                <option key={s.email} value={s.email}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={cn(
                  "h-[26px] rounded-full border px-2.5 font-sans text-xs",
                  preset === p.key
                    ? "border-primary bg-primary font-medium text-primary-foreground"
                    : "border-border bg-surface text-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                aria-label="起始日期"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-[30px] rounded-token border border-border bg-surface px-2 font-mono text-[12px]"
              />
              <span className="text-muted">–</span>
              <input
                aria-label="结束日期"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-[30px] rounded-token border border-border bg-surface px-2 font-mono text-[12px]"
              />
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-background p-[22px]">
        {filtered.length === 0 ? (
          <p className="m-0 font-sans text-[13px] leading-relaxed text-muted">
            这段时间没有互动记录。
          </p>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-token border border-border bg-surface">
            {filtered.map((i, idx) => (
              <div
                key={`${i.studentEmail}-${i.at}-${idx}`}
                data-testid={`interaction-row-${i.studentEmail}-${i.at}`}
                className="flex items-center gap-3 border-b border-border px-3 py-2.5 font-sans text-[12.5px] last:border-b-0"
              >
                <Badge variant={eventBadgeVariant(i.eventType)}>
                  {EVENT_LABEL[i.eventType] ?? i.eventType}
                </Badge>
                <span className="w-20 flex-none font-medium">{i.studentName}</span>
                <span className="flex-none text-muted">{i.courseName}</span>
                <span className="flex-1 text-muted-foreground">
                  {i.eventType === "nudged" ? channelLabel(i.channel) : i.note || "—"}
                </span>
                <span className="flex-none font-mono text-muted-foreground">{formatAt(i.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
