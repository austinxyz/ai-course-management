/** 手动录入"类型"与参与度信号的内部 key → 中文 label 映射。key 跟后端
 * `ManualInteractionType`/`ParticipationSignal` 的 `Literal` 取值一一对应
 * （`interactions-design-alignment` design.md 决定 1）。 */

export const MANUAL_TYPES = ["1on1", "consult", "tech_support", "hw_feedback"] as const;
export type ManualType = (typeof MANUAL_TYPES)[number];

export const MANUAL_TYPE_LABEL: Record<ManualType, string> = {
  "1on1": "1:1 沟通",
  consult: "咨询",
  tech_support: "技术支持",
  hw_feedback: "作业反馈",
};

export const PARTICIPATION_SIGNALS = [
  "live",
  "group_join",
  "group_lead",
  "group_active",
  "demo_day",
] as const;
export type ParticipationSignal = (typeof PARTICIPATION_SIGNALS)[number];

export const SIGNAL_LABEL: Record<ParticipationSignal, string> = {
  live: "出席直播",
  group_join: "加入兴趣小组",
  group_lead: "兴趣小组长",
  group_active: "兴趣小组积极发言",
  demo_day: "Demo Day 参展",
};

const AUTO_EVENT_LABEL: Record<string, string> = {
  nudged: "已催",
  skipped: "跳过",
  unskipped: "取消跳过",
};

/** 一条互动记录属于哪个来源分类——驱动来源 tab 与来源徽标。 */
export function sourceCategory(eventType: string): "auto" | "manual" | "participation" {
  if (eventType === "manual") return "manual";
  if (eventType === "participation") return "participation";
  return "auto";
}

export const SOURCE_LABEL: Record<ReturnType<typeof sourceCategory>, string> = {
  auto: "系统自动",
  manual: "人工录入",
  participation: "参与度",
};

/** 一条记录的"类型"展示文案——系统自动事件用既有的已催/跳过/取消跳过，
 * 人工录入用四类型 label，参与度信号用五标签 label。未知 key 原样显示，
 * 不因为查不到映射就报错或留空（design.md Risks）。 */
export function typeLabel(eventType: string, channel: string | null): string {
  if (eventType === "manual") return MANUAL_TYPE_LABEL[channel as ManualType] ?? channel ?? eventType;
  if (eventType === "participation") return SIGNAL_LABEL[channel as ParticipationSignal] ?? channel ?? eventType;
  return AUTO_EVENT_LABEL[eventType] ?? eventType;
}
