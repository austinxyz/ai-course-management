"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { markNudged, sendNudgeEmail, skipNudge, unskipNudge } from "./actions";
import type { NudgeCourse, NudgePerson } from "./types";

/**
 * 催作业页：`homework` 能力"未交"状态的可操作视图。
 *
 * 名单本身不可编辑——它是从报课+作业算出来的事实。这一页唯二的写入口是
 * "标记已催"与"跳过"，两者都只写一条 `nudge_events`，不碰报课/作业数据。
 */

/** `2026-08-01T14:20:00Z` → `2026-08-01 07:20`（美西）。 */
function formatAt(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(when);
}

/** `wechat`/`email` → 中文渠道名。 */
function channelLabel(channel: string | null): string {
  return channel === "wechat" ? "微信" : "邮件";
}

/** 三档固定文案模板——文案内容是固定文本，不接受配置（design.md Non-Goals）。 */
const TEMPLATES = {
  first: (person: NudgePerson, courseName: string) => `${person.name}，你好！

注意到你报名的《${courseName}》已经上完 ${person.overdueDays} 天了，还没看到你的作业提交。

有空的话欢迎尽快补交，卡在哪一步都可以随时找我。`,
  second: (person: NudgePerson, courseName: string) => `${person.name}，你好：

《${courseName}》的作业已经催过一次了，还是没收到你的提交。方便的话，卡在哪一步了跟我说一声？`,
  final: (person: NudgePerson, courseName: string) => `${person.name}，你好，

这是关于《${courseName}》作业的最后一次提醒了，已经逾期 ${person.overdueDays} 天。如果有困难请务必告诉我，不然这门课的作业会一直挂在未交状态。`,
} as const;

type TemplateKey = keyof typeof TEMPLATES;

const TEMPLATE_TABS: { key: TemplateKey; label: string }[] = [
  { key: "first", label: "第一次提醒" },
  { key: "second", label: "第二次提醒" },
  { key: "final", label: "最后一次" },
];

/** 按已催次数选默认档位：0 次→第一档，1 次→第二档，≥2 次→第三档。 */
function defaultTemplateKey(nudgedCount: number): TemplateKey {
  if (nudgedCount === 0) return "first";
  if (nudgedCount === 1) return "second";
  return "final";
}

function draftFor(person: NudgePerson, courseName: string, key: TemplateKey = defaultTemplateKey(0)): string {
  return TEMPLATES[key](person, courseName);
}

/** 姓名/邮箱/微信理论上可能带逗号——简单双引号包裹处理，不为这个低概率场景
 * 引入 CSV 生成库（design.md 决定 2 / Risks）。 */
function csvField(value: string | number): string {
  const text = String(value);
  return /[,"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 用页面已加载的 `people` 数据拼字符串——不为导出这个动作单独发起网络请求。 */
function toCsv(people: NudgePerson[]): string {
  const header = ["姓名", "邮箱", "微信", "逾期天数", "已催次数"].join(",");
  const rows = people.map((p) =>
    [
      p.name,
      p.studentEmail,
      p.wechat,
      p.overdueDays,
      p.history.filter((h) => h.type === "nudged").length,
    ]
      .map(csvField)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

function downloadCsv(people: NudgePerson[]) {
  const blob = new Blob([toCsv(people)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "未交名单.csv";
  link.click();
  URL.revokeObjectURL(url);
}

interface NudgeClientProps {
  courses: NudgeCourse[];
  courseId: string;
  people: NudgePerson[];
  skippedCount: number;
}

export function NudgeClient({ courses, courseId, people, skippedCount }: NudgeClientProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const course = courses.find((c) => c.id === courseId);
  const current = people.find((p) => p.studentEmail === selected) ?? null;
  const activeCount = people.filter((p) => !p.skipped).length;

  const sorted = useMemo(
    () => [...people].sort((a, b) => b.overdueDays - a.overdueDays),
    [people],
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-none flex-col gap-2.5 border-b border-border bg-surface px-[22px] pb-[13px] pt-4">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">催作业</h1>
            <span className="font-mono text-xs text-muted">
              {courses.length === 0
                ? "还没有课程"
                : `${activeCount} 人未交 · 已跳过 ${skippedCount} 人`}
            </span>
          </div>
          {people.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => downloadCsv(people.filter((p) => !p.skipped))}
            >
              导出名单
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/nudge?course=${c.id}`}
              className={cn(
                "inline-flex h-[26px] items-center whitespace-nowrap rounded-token border px-2.5 font-sans text-xs no-underline",
                c.id === courseId
                  ? "border-primary bg-primary font-medium text-primary-foreground"
                  : "border-border bg-surface text-foreground",
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">
          {people.length === 0 ? (
            <p className="m-0 p-[22px] font-sans text-[13px] leading-relaxed text-muted">
              这门课的人都交了，或者还没到该催的时候。
            </p>
          ) : (
            <table className="w-full border-collapse font-sans text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left">
                  <Th>姓名</Th>
                  <Th>微信</Th>
                  <Th>逾期</Th>
                  <Th>已催</Th>
                  <Th>上次催促</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const nudgedCount = p.history.filter((h) => h.type === "nudged").length;
                  const lastNudged = p.history.find((h) => h.type === "nudged");
                  return (
                    <tr
                      key={p.studentEmail}
                      data-testid={`nudge-${p.studentEmail}`}
                      onClick={() => setSelected(p.studentEmail)}
                      className={cn(
                        "cursor-pointer border-b border-border last:border-b-0 bg-surface",
                        p.skipped && "opacity-50",
                        p.studentEmail === selected &&
                          "shadow-[inset_2px_0_0_var(--color-primary)]",
                      )}
                    >
                      <Td>
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium">{p.name}</span>
                          {p.skipped && <Badge variant="default">已跳过</Badge>}
                        </span>
                      </Td>
                      <Td>
                        {p.wechat ? (
                          <span className="font-mono text-[11.5px]">{p.wechat}</span>
                        ) : (
                          <Badge variant="danger">未对齐微信</Badge>
                        )}
                      </Td>
                      <Td>
                        <span className="font-mono text-danger">{p.overdueDays} 天</span>
                      </Td>
                      <Td>
                        <span className="font-mono">{nudgedCount}</span>
                      </Td>
                      <Td>
                        {lastNudged ? (
                          <span className="flex flex-col gap-0.5">
                            <span className="font-mono text-[11.5px] text-muted-foreground">
                              {formatAt(lastNudged.at)}
                            </span>
                            {lastNudged.note && (
                              <span className="text-[11px] text-muted-foreground">
                                {lastNudged.note}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">还没催过</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {current && (
          <DetailPanel key={current.studentEmail} person={current} courseName={course?.name ?? ""} />
        )}
      </div>
    </main>
  );
}

function DetailPanel({
  person,
  courseName,
}: {
  person: NudgePerson;
  courseName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const nudgedCount = person.history.filter((h) => h.type === "nudged").length;
  // 换人靠父组件的 `key={studentEmail}` 整个组件重新挂载复位，同 draft 的既有机制。
  const [templateKey, setTemplateKey] = useState<TemplateKey>(() => defaultTemplateKey(nudgedCount));
  // 编辑只影响当次展示——挂在这个组件实例上，靠父组件的 `key={studentEmail}`
  // 换人时整个组件重新挂载，天然回到 draftFor() 生成的默认值，不需要额外的
  // "重置"分支（student-homework-summary 那次的深链接同步 bug 是反面教材：
  // 状态挂在错误的地方，prop 变了但没跟着换）。
  const [draft, setDraft] = useState(() => draftFor(person, courseName, templateKey));

  function handleTemplateSwitch(key: TemplateKey) {
    // 只有当前草稿仍等于当前档位的默认文案（未被编辑过）才替换——已编辑过的
    // 草稿切 tab 不动，避免手滑点了个 tab 把讲师刚写的话冲掉。
    if (draft === TEMPLATES[templateKey](person, courseName)) {
      setDraft(TEMPLATES[key](person, courseName));
    }
    setTemplateKey(key);
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      setError("没能复制到剪贴板，请手动选中文字复制。");
    }
  }

  async function handleMarkNudged() {
    setBusy(true);
    setError(null);
    const outcome = await markNudged(person.studentEmail, person.courseId);
    setBusy(false);
    if (!outcome.ok) setError(outcome.message);
  }

  async function handleSkip() {
    setBusy(true);
    setError(null);
    const outcome = await skipNudge(person.studentEmail, person.courseId);
    setBusy(false);
    if (!outcome.ok) setError(outcome.message);
  }

  async function handleUnskip() {
    setBusy(true);
    setError(null);
    const outcome = await unskipNudge(person.studentEmail, person.courseId);
    setBusy(false);
    if (!outcome.ok) setError(outcome.message);
  }

  async function handleSendEmail() {
    setShowConfirm(false);
    setBusy(true);
    setError(null);
    const outcome = await sendNudgeEmail(person.studentEmail, person.courseId, draft);
    setBusy(false);
    if (!outcome.ok) setError(outcome.message);
  }

  return (
    <aside
      data-testid="nudge-detail"
      className="flex w-[360px] flex-none flex-col gap-3.5 overflow-y-auto border-l border-border bg-surface p-[18px]"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-sans text-[15px] font-semibold">{person.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{person.studentEmail}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          走{channelLabel(person.wechat ? "wechat" : "email")}
          {person.wechat && ` · ${person.wechat}`}
        </span>
      </div>

      <div className="flex gap-4">
        <Stat label="已逾期" value={`${person.overdueDays} 天`} tone="danger" />
        <Stat
          label="已催次数"
          value={String(person.history.filter((h) => h.type === "nudged").length)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div role="tablist" className="flex gap-1">
          {TEMPLATE_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={tab.key === templateKey}
              onClick={() => handleTemplateSwitch(tab.key)}
              className={cn(
                "rounded-token border px-2 py-1 font-sans text-[11.5px]",
                tab.key === templateKey
                  ? "border-primary bg-primary font-medium text-primary-foreground"
                  : "border-border bg-surface text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          按已催次数自动推荐档位，可手动切换
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          草稿 · 可编辑
        </span>
        <textarea
          rows={7}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-token border border-border bg-background px-3 py-2.5 font-sans text-[12.5px] leading-relaxed text-foreground outline-none focus:border-primary"
        />
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={copyDraft}>
          复制文案
        </Button>
        <Button className="flex-1" disabled={busy} onClick={handleMarkNudged}>
          标记已催
        </Button>
      </div>
      <Button variant="secondary" disabled={busy} onClick={() => setShowConfirm(true)}>
        发送邮件
      </Button>
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/30 p-8">
          <div
            role="dialog"
            aria-label="确认发送邮件"
            className="flex w-[420px] flex-col gap-3 rounded-token border border-border bg-surface p-5"
          >
            <p className="m-0 font-sans text-[13px] leading-relaxed text-foreground">
              确认发送给 {person.studentEmail}？
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>
                取消
              </Button>
              <Button onClick={handleSendEmail}>确认发送</Button>
            </div>
          </div>
        </div>
      )}
      {person.skipped ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={handleUnskip}>
          取消跳过
        </Button>
      ) : (
        <Button variant="ghost" size="sm" disabled={busy} onClick={handleSkip}>
          跳过
        </Button>
      )}

      {error && (
        <p role="alert" className="m-0 font-sans text-[11.5px] text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-dashed border-border pt-3">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          催促历史
        </span>
        {person.history.length === 0 ? (
          <span className="font-sans text-[12px] text-muted-foreground">还没催过这个人。</span>
        ) : (
          <div className="flex flex-col gap-0.5 overflow-hidden rounded-token border border-border">
            {person.history.map((h, i) => (
              <div
                key={`${h.at}-${i}`}
                data-testid={`history-${h.at}`}
                className={cn(
                  "flex items-center justify-between gap-2 px-2.5 py-1.5 font-sans text-[12px]",
                  i % 2 ? "bg-surface-muted" : "bg-surface",
                )}
              >
                <span className="font-mono">{formatAt(h.at)}</span>
                <span className="text-muted-foreground">
                  {h.type === "nudged"
                    ? channelLabel(h.channel)
                    : h.type === "unskipped"
                      ? "取消跳过"
                      : "跳过"}
                  {h.note ? ` · ${h.note}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("font-mono text-[18px]", tone === "danger" && "text-danger")}>
        {value}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
    </div>
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
