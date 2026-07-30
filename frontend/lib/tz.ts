/**
 * 把一个绝对时刻格式化到各时区。
 *
 * 这里**只做格式化**。"墙上时间 → 绝对时刻"那步反向换算在后端用 zoneinfo 做，
 * 因为 JS 没有原生 API 能求"某时区的 19:30 是哪一刻"，通用做法是拿 Intl 试探偏移
 * 再迭代修正 —— 那是整个功能最容易写错的一段，不该在前后端各写一遍。
 *
 * 格式化一个已知时刻是 Intl 的强项，夏令时由时区数据处理，这里不出现任何偏移数字。
 */

/** 显示用的时区行。顺序即界面上的顺序。 */
export const ZONE_ROWS: { label: string; timeZone: string }[] = [
  { label: "美西", timeZone: "America/Los_Angeles" },
  { label: "美东", timeZone: "America/New_York" },
  { label: "加拿大", timeZone: "America/Toronto" },
  { label: "上海", timeZone: "Asia/Shanghai" },
];

const WEEKDAY_ZH: Record<string, string> = {
  Sun: "周日",
  Mon: "周一",
  Tue: "周二",
  Wed: "周三",
  Thu: "周四",
  Fri: "周五",
  Sat: "周六",
};

function parts(iso: string, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  return Object.fromEntries(
    formatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
}

/** `19:30`，24 小时制。 */
export function timeIn(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  // en-CA 把午夜写成 24:00，而那是前一天的 24 点，显示成 00:00 才是人读的写法。
  return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** `2026-10-16`。 */
export function dateIn(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** `周四` —— 排课时星期比日期好核对。 */
export function weekdayIn(iso: string, timeZone: string): string {
  return WEEKDAY_ZH[parts(iso, timeZone).weekday] ?? "";
}

/**
 * 一行「时区 时间」。
 *
 * 跨日必须标出来：美西晚 7:30 在上海是次日上午，只写「上海 10:30」会被读成同一天早上，
 * 而那正是拿这行去发通知的人最容易搞错的地方。
 */
export function zoneLine(
  iso: string,
  baseTimeZone: string,
  row: { label: string; timeZone: string },
): string {
  const time = timeIn(iso, row.timeZone);
  const here = dateIn(iso, row.timeZone);
  const base = dateIn(iso, baseTimeZone);
  const shift = here === base ? "" : here > base ? " 次日" : " 前一日";
  return `${row.label} ${time}${shift}`;
}
