"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { applyImport, excludeEmailAction, markReplied, markUnreplied, previewImport } from "./actions";
import { ImportDialog } from "./ImportDialog";
import type { HomeworkCourse, HomeworkPerson, LastImport } from "./types";

/**
 * 作业页：`grades.csv` 的镜像。
 *
 * 有且只有**一个**写入入口：整份文件导入。成绩本身不可逐条编辑——
 * 源文件由批改流程生成并由人维护，两边都能改单条就会分叉，
 * 而分叉之后没有哪一边有资格当准。整份导入不产生这个问题：
 * 它的语义是"以这份文件为准"。
 *
 * 稿子上那个「重新同步」按钮此前被判为做不出来，理由是文件在另一个仓库、
 * 部署环境的后端看不到。前半句成立，结论不成立：**浏览器上传**恰恰
 * 绕开了后端读不到文件系统这件事。
 */

/** 四态。三态不够：没有场次就没有截止时间，催他是冤的。 */
/**
 * 四态。三态不够：没有场次就没有截止时间，催他是冤的。
 *
 * `tone` 是这一列唯一的语气，所以三种"没交"不能共用同一个颜色：
 * 「未交」是真的欠着（danger），「未定场次」是**我方**还有事没做（primary，
 * 与报课页同一套语言），「未开放」则完全正常（muted）。
 * 一律用红的话，一屏未开放会读起来像出事了。
 */
const STATE = {
  submitted: { label: "已交", dot: "bg-success", tone: "text-foreground", note: "" },
  missing: { label: "未交", dot: "bg-danger", tone: "text-danger", note: "有报课无提交" },
  not_open: {
    label: "未开放",
    dot: "bg-muted-foreground",
    tone: "text-muted",
    note: "场次还没上",
  },
  no_session: {
    label: "未定场次",
    dot: "bg-primary",
    tone: "text-primary",
    note: "先指派场次",
  },
} as const;

type Filter = "all" | "submitted" | "missing" | "pending_reply";

/**
 * 分项/总分按比例落入的三档。阈值与颜色是详情面板、名单迷你竖条共用的
 * 同一套语言——同一个比例在两处必须读出同一件事。
 */
type Tone = "success" | "warning" | "danger";

function scoreTone(ratio: number): Tone {
  if (ratio >= 0.9) return "success";
  if (ratio >= 0.7) return "warning";
  return "danger";
}

const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const TONE_BG: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * 待回复 = 已交，且讲师没有手动标记为已回复。
 *
 * 不看源文件的 `replyStatus`：那一列每次重新导入整列覆盖，讲师实际回复
 * 往往发生在系统之外，源文件那列常常没跟上。`replied` 是独立存储、
 * 不受重新导入影响的信号。
 */
function awaitingReply(person: HomeworkPerson): boolean {
  return person.state === "submitted" && !person.replied;
}

const MATCHES: Record<Filter, (p: HomeworkPerson) => boolean> = {
  all: () => true,
  submitted: (p) => p.state === "submitted",
  missing: (p) => p.state === "missing",
  pending_reply: awaitingReply,
};

interface HomeworkClientProps {
  courses: HomeworkCourse[];
  courseId: string;
  people: HomeworkPerson[];
  /** 还没导过就是 null——"还没有"是正常状态，不占一行说空话。 */
  lastImport: LastImport | null;
}

/** `2026-07-31T22:47:00Z` → `2026-07-31 15:47`（美西）。 */
function formatImportedAt(iso: string): string {
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

export function HomeworkClient({
  courses,
  courseId,
  people,
  lastImport,
}: HomeworkClientProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  // 浏览器留着这个 File，确认时再读一次、再送一次。服务端不存临时上传：
  // 那要多一张表、要过期清理、还要处理"确认时那份临时数据已被清掉"，
  // 而文件只有几 KB。
  const [picked, setPicked] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const counts = useMemo(
    () => ({
      all: people.length,
      submitted: people.filter(MATCHES.submitted).length,
      missing: people.filter(MATCHES.missing).length,
      pending_reply: people.filter(MATCHES.pending_reply).length,
    }),
    [people],
  );

  const rows = people.filter(MATCHES[filter]);
  const current = rows.find((p) => p.studentEmail === selected) ?? null;
  const course = courses.find((c) => c.id === courseId);

  /**
   * File + courseId → FormData → Server Action。
   *
   * 每次都重新读一遍那个 File 而不是把 base64 存下来：预览与确认之间
   * 数据库可能变了（比如有人补建了学员），确认时的结果**以真跑为准**，
   * 界面显示实际结果，不复述预览。
   */
  function formFor(file: File): FormData {
    const form = new FormData();
    form.set("file", file);
    form.set("courseId", courseId);
    return form;
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {picked && (
        <ImportDialog
          file={picked}
          courseId={courseId}
          courseName={course?.name ?? ""}
          onPreview={(file) => previewImport(formFor(file))}
          onApply={(file) => applyImport(formFor(file))}
          onExclude={(email) => excludeEmailAction(email)}
          onClose={() => setPicked(null)}
        />
      )}
      <header className="flex flex-none flex-col gap-2.5 border-b border-border bg-surface px-[22px] pb-[13px] pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">作业</h1>
            {/* 人数，不是课程名——课程名已经在高亮的那个 chip 上了。
                两处写同一件事只会占掉本可以说点别的的位置。 */}
            <span className="font-mono text-xs text-muted">
              {courses.length === 0 ? "还没有课程" : `${people.length} 人`}
            </span>
            {/* 包住 input 的 label：它的可见文字就是这个 file input 的
                可访问名称，不用再加 aria-label（加了反而变成两个同名节点）。 */}
            {courseId && (
              <label className="ml-auto inline-flex h-[26px] cursor-pointer items-center rounded-token border border-border bg-surface px-2.5 font-sans text-xs">
                导入 grades.csv
                {/* 按**内容**判定可用与否，不按扩展名——扩展名是最容易伪装
                    也最容易误伤的判据。`accept` 只是文件选择器的默认过滤，
                    不是校验：用户照样能选别的，而那由后端说了算。 */}
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const chosen = event.target.files?.[0] ?? null;
                    setPicked(chosen);
                    // 选同一个文件两次也要能触发——input 的 value 不清空的话
                    // 第二次 change 根本不发生，看起来像按钮坏了。
                    event.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <p className="m-0 font-sans text-[12.5px] text-muted">
            grades.csv 的镜像。改成绩要回 ai-course 仓库改 csv，再把新的文件导进来。
          </p>
          {lastImport && (
            <div data-testid="last-import" className="font-mono text-[11.5px] text-muted-fg">
              <span>上次导入 {formatImportedAt(lastImport.importedAt)}</span>
              <span> · {lastImport.filename}</span>
              <span> · {lastImport.rowCount} 行</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* 课程**不**给选：已经在 URL 里，多一个可选错的地方不如没有。
              这些 chip 是导航，不是这次导入的目标选择器。 */}
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/homework?course=${c.id}`}
              className={cn(
                "inline-flex h-[26px] items-center whitespace-nowrap rounded-token border px-2.5 font-sans text-xs no-underline",
                c.id === courseId
                  ? "border-primary bg-primary font-medium text-primary-foreground"
                  : "border-border bg-surface text-foreground",
              )}
            >
              {/* 课程名，不是简称：`S3` / `S4` 只在讲师脑子里对得上课程，
                  而报课页一直显示的是课程名。同一件东西两页两个叫法，
                  切页面就要重新认一遍。 */}
              {c.name}
            </Link>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto bg-background p-[22px]">
          {people.length === 0 ? (
            <p className="m-0 rounded-token border border-dashed border-border bg-surface-muted px-4 py-6 text-center font-sans text-[13px] leading-relaxed text-muted">
              这门课还没有任何报课记录。名单来自报课——先在学员详情里补录，
              这一页才有人可列。
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                  全部 {counts.all}
                </FilterChip>
                <FilterChip
                  active={filter === "submitted"}
                  onClick={() => setFilter("submitted")}
                >
                  已交 {counts.submitted}
                </FilterChip>
                <FilterChip active={filter === "missing"} onClick={() => setFilter("missing")}>
                  未交 {counts.missing}
                </FilterChip>
                <FilterChip
                  active={filter === "pending_reply"}
                  onClick={() => setFilter("pending_reply")}
                >
                  待回复 {counts.pending_reply}
                </FilterChip>
              </div>

              {counts.submitted === 0 && (
                <p className="m-0 rounded-token border border-dashed border-border bg-surface-muted px-3 py-2.5 font-sans text-[12.5px] leading-relaxed text-muted">
                  这门课还没有任何提交记录。如果作业已经批过了，用右上角的
                  「导入 grades.csv」把批改结果传上来。
                </p>
              )}

              {/* flex-none 不能省：外框上的 overflow-hidden 是为了圆角，但它同时是个
                  会被压缩的 flex 子项——被挤扁后它把超出的行**裁掉**，而外层滚动容器
                  因此看不到任何溢出，于是哪儿都没有滚动条。S1 有 17 行，够撞上。 */}
              <div className="flex-none overflow-hidden rounded-token border border-border bg-surface">
                <table className="w-full border-collapse font-sans text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted text-left">
                      <Th>学员</Th>
                      <Th>提交时间</Th>
                      <Th>总分</Th>
                      <Th>分项</Th>
                      <Th>回复</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const meta = STATE[p.state as keyof typeof STATE];
                      return (
                        <tr
                          key={p.studentEmail}
                          data-testid={`homework-${p.studentEmail}`}
                          onClick={() => setSelected(p.studentEmail)}
                          className={cn(
                            "cursor-pointer border-b border-border last:border-b-0",
                            p.state === "missing" ? "bg-danger-surface" : "bg-surface",
                            p.studentEmail === selected && "shadow-[inset_2px_0_0_var(--color-primary)]",
                          )}
                        >
                          <Td>
                            <span className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1.5">
                                <span
                                  data-testid="state-dot"
                                  className={cn(
                                    "inline-block h-1.5 w-1.5 flex-none rounded-full",
                                    meta?.dot ?? "bg-muted-foreground",
                                  )}
                                />
                                {p.name}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {p.studentEmail}
                              </span>
                            </span>
                          </Td>
                          <Td>
                            <span className="flex flex-col gap-0.5">
                              <span
                                data-testid="state-label"
                                className={cn(
                                  "font-mono text-[11.5px]",
                                  meta?.tone ?? "text-foreground",
                                )}
                              >
                                {p.submittedAt ?? meta?.label}
                              </span>
                              {!p.submittedAt && meta?.note && (
                                <span className="font-sans text-[11px] text-muted-foreground">
                                  {meta.note}
                                </span>
                              )}
                            </span>
                          </Td>
                          <Td>
                            <span className="font-mono text-[12.5px]">
                              {/* 没交的人是「—」，不是 0 —— 0 是一个真实的分数 */}
                              {p.total ?? "—"}
                            </span>
                          </Td>
                          <Td>
                            {/* 迷你竖条：不点进详情就能看出这个人哪几项弱。
                                只给配了满分的分项画柱子——没有满分就没有比例可言。 */}
                            {p.scores.some((s) => s.max !== null) && (
                              <div
                                data-testid={`sparkline-${p.studentEmail}`}
                                className="flex items-end gap-0.5"
                                style={{ height: "20px" }}
                              >
                                {p.scores
                                  .filter((s): s is typeof s & { max: number } => s.max !== null)
                                  .map((s) => {
                                    const ratio = s.max > 0 ? s.score / s.max : 0;
                                    return (
                                      <span
                                        key={s.item}
                                        data-testid={`spark-bar-${p.studentEmail}-${s.item}`}
                                        title={`${s.item} ${s.score}/${s.max}`}
                                        className={cn("w-1.5 flex-none rounded-sm", TONE_BG[scoreTone(ratio)])}
                                        style={{ height: `${Math.max(4, Math.round(ratio * 20))}px` }}
                                      />
                                    );
                                  })}
                              </div>
                            )}
                          </Td>
                          <Td>
                            {/* 讲师标记比源文件那列更可信——那一列每次导入整列
                                覆盖，常常没跟上讲师实际的回复动作。名单**以标记
                                为准**：标记了就显示「已回复」，不看源文件当时
                                写的是什么，避免拿一个可能过期的原文误导人。 */}
                            {p.replied ? (
                              <span className="text-success">已回复</span>
                            ) : (
                              <span className="text-muted-foreground">
                                {p.replyStatus || "—"}
                              </span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {current && (
          <DetailPanel key={current.studentEmail} person={current} courseName={course?.name ?? ""} />
        )}
      </div>
    </main>
  );
}

function DetailPanel({ person, courseName }: { person: HomeworkPerson; courseName: string }) {
  const meta = STATE[person.state as keyof typeof STATE];
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  async function toggleReplied() {
    if (!person.submissionId) return;
    setMarking(true);
    setMarkError(null);
    const action = person.replied ? markUnreplied : markReplied;
    const outcome = await action(person.submissionId);
    setMarking(false);
    if (!outcome.ok) {
      setMarkError(outcome.message);
    }
    // 成功时不用本地更新状态——`revalidatePath` 会带回新的 `people`，
    // `current` 从更新后的 props 里重新算出来。
  }

  return (
    <aside
      data-testid="homework-detail"
      className="flex w-[420px] flex-none flex-col gap-3 overflow-y-auto border-l border-border bg-surface p-[18px]"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-sans text-[15px] font-semibold">{person.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {person.studentEmail}
        </span>
        <span className="font-sans text-[12px] text-muted">{courseName}</span>
      </div>

      {person.total === null ? (
        <div className="flex flex-col gap-1.5 rounded-token border border-dashed border-border bg-surface-muted px-3 py-2.5">
          <span className="font-sans text-[12.5px] text-foreground">
            {person.state === "missing"
              ? "课已上完，还没交。"
              : person.state === "no_session"
                ? "还没定场次，所以还谈不上交没交——先指派场次。"
                : "场次还没上，现在没有提交是正常的。"}
          </span>
          {/* 催作业要用微信，而微信号是人工对齐的属性，常常是空的。
              这一句现在只是提示；催作业那一片会用到它。 */}
          <span className="font-sans text-[11.5px] text-muted">
            {person.wechat
              ? `微信 ${person.wechat} 已对齐，可以直接私聊。`
              : "这位学员的微信还没对齐，只能走邮件。"}
          </span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2.5">
              <span
                className={cn(
                  "font-mono text-[26px] leading-none",
                  person.totalMax !== null &&
                    person.total !== null &&
                    TONE_TEXT[scoreTone(person.total / person.totalMax)],
                )}
              >
                {person.total}
              </span>
              {/* 有名次；满分只有该课全部分项都配了才显示——少一项就等于分母算错了。 */}
              {person.rank !== null && (
                <span className="font-mono text-[11.5px] text-muted-foreground">
                  本课第 {person.rank} / {person.rankOf}
                </span>
              )}
            </div>
            {person.totalMax !== null && person.total !== null && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  data-testid="total-progress-fill"
                  className={cn("h-full rounded-full", TONE_BG[scoreTone(person.total / person.totalMax)])}
                  style={{ width: `${Math.round((person.total / person.totalMax) * 100)}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
              分项 {person.scores.length} 项 · 原始分
            </span>
            <div className="overflow-hidden rounded-token border border-border">
              {person.scores.map((s, i) => {
                const ratio = s.max !== null && s.max > 0 ? s.score / s.max : null;
                const tone = ratio !== null ? scoreTone(ratio) : null;
                return (
                  <div
                    key={s.item}
                    data-testid={`score-${s.item}`}
                    className={cn(
                      "flex items-center justify-between gap-3 px-2.5 py-1.5 font-sans text-[12px]",
                      i % 2 ? "bg-surface-muted" : "bg-surface",
                    )}
                  >
                    <span>{s.item}</span>
                    <div className="flex items-center gap-2">
                      {/* 没配满分的项不画条形图——没有比例可言。 */}
                      {s.max !== null && (
                        <span className="h-1 w-14 flex-none overflow-hidden rounded-full bg-surface-muted">
                          <span
                            data-testid={`score-bar-${s.item}`}
                            className={cn("block h-full rounded-full", tone && TONE_BG[tone])}
                            style={{ width: `${Math.round((ratio ?? 0) * 100)}%` }}
                          />
                        </span>
                      )}
                      <span
                        data-testid={`score-text-${s.item}`}
                        className={cn("font-mono", tone && TONE_TEXT[tone])}
                      >
                        {s.max !== null ? `${s.score} / ${s.max}` : s.score}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Field label="亮点">{person.highlight || "—"}</Field>
          <Field label="改进建议">{person.improve || "—"}</Field>
          <Field label="回复状态">{person.replyStatus || "—"}</Field>

          {/* 独立于「回复状态」——那一列是源文件原文，这里是讲师自己的标记，
              重新导入不会把它冲掉。两者视觉上分开，不合并成一句话。 */}
          {person.submissionId && (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
                讲师标记
              </span>
              <div className="flex items-center justify-between gap-2">
                {person.replied ? (
                  <div className="flex flex-col gap-0.5">
                    <span
                      data-testid="replied-badge"
                      className="inline-flex w-fit items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 font-sans text-[11px] text-success"
                    >
                      ✓ 已回复
                    </span>
                    {person.repliedAt && (
                      <span className="font-mono text-[10.5px] text-muted-foreground">
                        {formatImportedAt(person.repliedAt)} 标记
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="font-sans text-[12.5px] text-muted">尚未标记</span>
                )}
                <button
                  type="button"
                  disabled={marking}
                  onClick={toggleReplied}
                  className="inline-flex h-[26px] items-center whitespace-nowrap rounded-token border border-border bg-surface px-2.5 font-sans text-xs disabled:opacity-50"
                >
                  {person.replied ? "标记未回复" : "标记已回复"}
                </button>
              </div>
              {markError && (
                <p role="alert" className="m-0 font-sans text-[11.5px] text-danger">
                  {markError}
                </p>
              )}
            </div>
          )}

          {/* 来源单独成一个节点：出问题时要能整段复制回源仓库去核，
              跟提交日期拼在一起就复制不干净了。 */}
          <span className="font-mono text-[11px] text-muted-foreground">
            <span>{person.sourceRef}</span>
            {person.submittedAt && <span> · 提交于 {person.submittedAt}</span>}
          </span>
        </>
      )}

      {meta && person.total !== null && (
        <span className="font-mono text-[11px] text-muted-foreground">{meta.label}</span>
      )}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-sans text-[12.5px] leading-relaxed">{children}</span>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-[26px] items-center whitespace-nowrap rounded-token border px-2.5 font-sans text-xs",
        active
          ? "border-primary bg-primary font-medium text-primary-foreground"
          : "border-border bg-surface text-foreground",
      )}
    >
      {children}
    </button>
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
