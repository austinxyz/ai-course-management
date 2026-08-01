"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

import type { ImportResult } from "./types";

/**
 * 编码代号 → 给人看的名字。
 *
 * GB18030 在这一屏上就叫 GBK——那是用户在 Excel 的另存为对话框里见过的词。
 * 认不出的值**原样显示**，不假装是 UTF-8：后端将来多支持一种编码时，
 * 悄悄标成 UTF-8 会让"按什么读的"这一行开始撒谎，而这一行存在的全部理由
 * 就是让人能核对。
 */
function encodingLabel(encoding: string): string {
  if (encoding === "gb18030") return "GBK";
  if (encoding === "utf-8") return "UTF-8";
  return encoding;
}

type PreviewOutcome = { ok: true; result: ImportResult } | { ok: false; message: string };
type WriteOutcome = { ok: true } | { ok: false; message: string };

/**
 * action 的两种失败**形状不同**，这里把它们收成一种。
 *
 * 预期内的结果（编码不对、表头不符、课程不存在、超限）由 action 用**返回值**
 * 表达；而鉴权失败是**抛**的——被拒绝的写入不能读成"写了但没改动"。
 * 站点密码过期、网络断了、平台把函数掐了，走的都是抛这条路。
 *
 * 不接的话，抛出来的那条会变成 `useEffect` 里的未处理 rejection：
 * 弹窗停在"正在读取…"，永远不动，也没有任何一句话解释发生了什么。
 */
async function settle<T extends { ok: boolean }>(
  run: () => Promise<T>,
  fallback: string,
): Promise<T | { ok: false; message: string }> {
  try {
    return await run();
  } catch {
    // 具体的 message 不往外抬：生产构建里 Server Action 抛出的错误只剩一个
    // digest，拿到的字符串对用户没有意义。
    return { ok: false, message: fallback };
  }
}

interface ImportDialogProps {
  file: File;
  courseId: string;
  /** 显示用。界面上**没有**课程选择控件——课程已经在 URL 里，多一个可选错的地方不如没有。 */
  courseName: string;
  onPreview: (file: File, courseId: string) => Promise<PreviewOutcome>;
  onApply: (file: File, courseId: string) => Promise<PreviewOutcome>;
  onExclude: (email: string) => Promise<WriteOutcome>;
  onClose: () => void;
}

/**
 * 写入前的那一屏。
 *
 * 两条不可让步的规则：
 * 1. 写入期间**所有出口禁用**，含取消。失败信息渲染在这一屏上，
 *    中途关掉它就把失败信息一起带走了。只在成功回调里关闭。
 * 2. 标记排除后**整屏重算**，靠重发一次预览请求，不在前端加减——
 *    前端算出来的数与后端真跑时的判断可以不一致，而不一致只在写入后才暴露。
 */
export function ImportDialog(props: ImportDialogProps) {
  const { file, courseId, courseName, onPreview, onApply, onExclude, onClose } = props;

  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 三态而不是一个 boolean：预览中还没有东西可看，写入中有一屏要保护住。
  const [phase, setPhase] = useState<"previewing" | "ready" | "writing">("previewing");

  /**
   * 取一次预览。`while` 是取数**期间**界面处于哪一态。
   *
   * 首次进来是 `previewing`（还没有东西可看）。标记排除之后的重算传 `writing`：
   * 那时屏幕上还留着上一次的数字与按钮，一旦把出口放开，用户可以再标一个人，
   * 于是两个 dry-run 同时在飞——先发的后回时，留在屏幕上的是**旧的**数字，
   * 而确认按钮上那个数正是他要核对的东西。
   */
  const load = useCallback(
    async (whileLoading: "previewing" | "writing") => {
      setPhase(whileLoading);
      setError(null);
      const outcome = await settle(
        () => onPreview(file, courseId),
        "读不出这份文件的预览，请确认还登录着，然后重试。",
      );
      if (outcome.ok) {
        setResult(outcome.result);
        setPhase("ready");
        return;
      }
      // 预览失败就没有可确认的东西——不进 ready，也就不会有确认按钮。
      setResult(null);
      setError(outcome.message);
      setPhase("previewing");
    },
    [file, courseId, onPreview],
  );

  useEffect(() => {
    void load("previewing");
  }, [load]);

  const busy = phase === "writing";

  async function confirm() {
    setPhase("writing");
    setError(null);
    const outcome = await settle(
      () => onApply(file, courseId),
      "导入没能完成，请确认还登录着，然后重试。",
    );
    if (outcome.ok) {
      // 只在成功回调里关闭。
      onClose();
      return;
    }
    // 失败：留在这一屏，把话说在这里，并把出口放开——不能把人锁死。
    setError(outcome.message);
    setPhase("ready");
  }

  async function exclude(email: string) {
    setPhase("writing");
    // 上一次操作的错误先清掉，否则两条错误叠在一起，读不出哪条是刚发生的。
    setError(null);
    const outcome = await settle(
      () => onExclude(email),
      "没能标记这个邮箱，请确认还登录着，然后重试。",
    );
    if (!outcome.ok) {
      setError(outcome.message);
      setPhase("ready");
      return;
    }
    // 整屏重算：重新请求一次预览，数字由后端说了算，前端不加减。
    // 传 "writing" 而不是让它落回 "previewing"——重算期间出口必须一直关着。
    await load("writing");
  }

  const willWrite = result ? result.created + result.updated : 0;
  // 「将跳过」只算**不在学员表**那一批——他们的成绩不会写入。
  // 「无报课记录」不算：那些成绩是写了的，只是页面上看不到，
  // 合成一个数就把"到底写了没有"这件事抹平了，而两者的处置正好相反。
  const willSkip = result ? result.skippedNoStudent.length : 0;
  // 源文件里有、这次没用上的行：重复提交被顶掉的 + 没有邮箱的。
  // 两种丢法不同，但对账时是同一笔差额——只报"可用 17 行"的话，
  // 源文件明明是 18 行这件事就没人对得上。
  const dropped = result ? result.superseded.length + result.rowsWithoutEmail.length : 0;
  const rawRows = result ? result.rowCount + dropped : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/30 p-8">
      <div
        role="dialog"
        aria-label="导入 grades.csv"
        className="flex w-[640px] flex-col gap-3 rounded-token border border-border bg-surface p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {/* 导入到哪门课说出来，但不给选——课程恒为当前选中的那一门。 */}
            <div className="font-sans text-[15px] font-semibold">
              {courseName} · {file.name}
            </div>
            {result && (
              <div className="font-sans text-xs text-muted">
                按 {encodingLabel(result.encoding)} 读取 ·{" "}
                {dropped > 0 ? `共 ${rawRows} 行 → 可用 ${result.rowCount} 行` : `${result.rowCount} 行`}
              </div>
            )}
          </div>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            关闭
          </Button>
        </div>

        {phase === "previewing" && !error && (
          <p className="m-0 font-sans text-[13px] text-muted">正在读取这份文件…</p>
        )}

        {result && (
          <>
            {result.encoding === "gb18030" && (
              <div className="rounded-token border border-danger-border bg-danger-surface px-3 py-2.5 font-sans text-[12.5px] leading-relaxed">
                这份文件不是 UTF-8，已按 GBK 解读。<strong>请核对下面的中文是否正常</strong>
                ——解错编码不会报错，只会让亮点、改进建议与分项列名变成乱码。
              </div>
            )}

            {result.headerWarning && (
              <div
                data-testid="header-warning"
                className="rounded-token border border-danger-border bg-danger-surface px-3 py-2.5 font-sans text-[12.5px] leading-relaxed"
              >
                <strong>这份表头与该课程已有成绩的分项列不同。</strong>
                <br />
                文件里是 <code className="font-mono">{result.headerWarning.fileItems.join(" · ")}</code>
                <br />
                库里已有{" "}
                <code className="font-mono">{result.headerWarning.existingItems.join(" · ")}</code>
                <br />
                最常见的成因是传错了课程。确认之前请核对一下。
              </div>
            )}

            <div data-testid="import-counts" className="flex gap-5 font-sans">
              <Count testId="count-created" label="将新建" value={result.created} />
              <Count testId="count-updated" label="将更新" value={result.updated} />
              {/* 第三个数用 danger 语气：它是"有东西进不去"，
                  与前两个"会发生什么"不是一类。 */}
              <Count
                testId="count-skipped"
                label="将跳过"
                value={willSkip}
                tone={willSkip > 0 ? "danger" : "normal"}
              />
            </div>

            {result.superseded.length > 0 && (
              <Panel title={`同一人重复提交，取较晚的一次 · ${result.superseded.length} 行`}>
                {result.superseded.map((ref) => (
                  <Row key={ref}>{ref}</Row>
                ))}
              </Panel>
            )}

            {result.rowsWithoutEmail.length > 0 && (
              <Panel title={`没有邮箱、关联不到人 · ${result.rowsWithoutEmail.length} 行`}>
                {result.rowsWithoutEmail.map((ref) => (
                  <Row key={ref}>{ref}</Row>
                ))}
              </Panel>
            )}

            {/* 两份清单**分开**、语气**不同**：
                「不在学员表」成绩不会写入（要先建档）→ danger；
                「无报课记录」成绩会写入但页面上看不到（要补报课）→ 普通。
                同一种视觉语气会让人以为是同一件事。 */}
            {result.skippedNoStudent.length > 0 && (
              <Panel
                testId="skipped-no-student"
                tone="danger"
                title={`${result.skippedNoStudent.length} 人不在学员表里，成绩不会写入`}
                hint="先去学员页建档，再回来重传。"
              >
                {result.skippedNoStudent.map((email) => (
                  <Row key={email} action={<ExcludeButton email={email} onClick={exclude} busy={busy} />}>
                    {email}
                  </Row>
                ))}
              </Panel>
            )}

            {result.skippedNoEnrollment.length > 0 && (
              <Panel
                testId="skipped-no-enrollment"
                title={`${result.skippedNoEnrollment.length} 人没有这门课的报课记录`}
                hint="成绩会写入，但作业名单来自报课记录，所以这些人在页面上不会出现。补一条报课即可。"
              >
                {result.skippedNoEnrollment.map((email) => (
                  <Row key={email} action={<ExcludeButton email={email} onClick={exclude} busy={busy} />}>
                    {email}
                  </Row>
                ))}
              </Panel>
            )}

            {result.excluded.length > 0 && (
              <Panel testId="excluded-list" title={`已排除 · ${result.excluded.length} 人`}>
                {result.excluded.map((email) => (
                  <Row key={email}>
                    <span className="text-muted line-through">{email}</span>
                  </Row>
                ))}
              </Panel>
            )}

            {result.rows.length > 0 && (
              <Panel
                testId="write-list"
                title={`将写入的 ${result.rows.length} 人`}
                hint="点右侧可把这个邮箱永久排除，之后任何一门课的导入都不再算它。"
              >
                {result.rows.map((row) => (
                  <Row
                    key={row.email}
                    action={<ExcludeButton email={row.email} onClick={exclude} busy={busy} />}
                  >
                    {row.name} <span className="text-muted">{row.email}</span>{" "}
                    <span className="font-mono">{row.total}</span>
                  </Row>
                ))}
              </Panel>
            )}
          </>
        )}

        {/* 失败信息**就地渲染**，不是 toast、不是跳转。 */}
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
              {/* 按钮上写**具体条数**。写「确认」的话，
                  用户点的是一个自己没复述过的动作。 */}
              {busy ? "导入中…" : `确认导入 ${willWrite} 条`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Count({
  testId,
  label,
  value,
  tone = "normal",
}: {
  testId: string;
  label: string;
  value: number;
  tone?: "danger" | "normal";
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        data-testid={testId}
        className={cn("font-mono text-[22px]", tone === "danger" && "text-danger")}
      >
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function Panel(props: {
  title: string;
  hint?: string;
  tone?: "danger" | "normal";
  testId?: string;
  children: React.ReactNode;
}) {
  const { title, hint, tone = "normal", testId, children } = props;
  return (
    <div
      data-testid={testId}
      data-tone={tone}
      className={cn(
        "overflow-hidden rounded-token border",
        tone === "danger" ? "border-danger-border bg-danger-surface" : "border-border bg-surface",
      )}
    >
      <div className="border-b border-border px-3 py-2 font-sans text-xs">
        <div className={cn(tone === "danger" ? "font-medium text-danger" : "text-muted")}>
          {title}
        </div>
        {hint && <div className="mt-0.5 text-muted">{hint}</div>}
      </div>
      {/* 清单可能很长（S1 是 17 行）。给它自己的滚动区，
          否则外框的 overflow-hidden 会把超出的行**静默裁掉**——
          没有滚动条，看不出还有内容。 */}
      <div className="max-h-52 overflow-y-auto">{children}</div>
    </div>
  );
}

function Row({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5 font-sans text-[12.5px] last:border-b-0">
      <span className="min-w-0 truncate">{children}</span>
      {action}
    </div>
  );
}

function ExcludeButton({
  email,
  onClick,
  busy,
}: {
  email: string;
  onClick: (email: string) => void;
  busy: boolean;
}) {
  return (
    <Button variant="ghost" disabled={busy} onClick={() => onClick(email)}>
      以后不算作业
    </Button>
  );
}
