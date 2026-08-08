/** 展示格式化的共享工具——原本只在 `nudge/NudgeClient.tsx` 里用，`interactions`
 * 页与学员详情面板"最近互动"卡片也需要同样的行为，搬到这里避免重复实现
 * （`interactions` design.md 决定 3）。 */

/** `2026-08-01T14:20:00Z` → `2026-08-01 07:20`（美西）。 */
export function formatAt(iso: string): string {
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
export function channelLabel(channel: string | null): string {
  return channel === "wechat" ? "微信" : "邮件";
}
