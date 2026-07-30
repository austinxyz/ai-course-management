import type { NavKey, NewStudentForm, Student } from "./types";

export const TAGS = ["新报名", "活跃", "小组长", "作业优秀", "时区冲突"];

export const TAG_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  新报名: { bg: "#f3f0ea", fg: "#79736a", border: "#e4e0d8" },
  活跃: { bg: "#e9f2ec", fg: "#2f6b4f", border: "#d6e6dc" },
  小组长: { bg: "#eceff5", fg: "#3f4b63", border: "#dde2ec" },
  作业优秀: { bg: "#f6ecdf", fg: "#8a5a10", border: "#ecdcc6" },
  时区冲突: { bg: "#fbf0ee", fg: "#a33a2b", border: "#f0cfc9" },
};

export const NAV: { key: NavKey; label: string; icon: string }[] = [
  { key: "students", label: "学员", icon: "M6 7.2a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM1.8 13.6c0-2.3 1.9-3.6 4.2-3.6s4.2 1.3 4.2 3.6M11 3.2a2 2 0 010 4M12.4 10.4c1.2.4 1.9 1.4 1.9 3.2" },
  { key: "enroll", label: "报课", icon: "M5.5 2.6h5v1.8h-5zM4 3.4H3.2v10.2h9.6V3.4H12M8 7.4v4M6 9.4h4" },
  { key: "homework", label: "作业", icon: "M4 2h5l3 3v9H4zM9 2v3h3M6 9h4M6 11.5h4" },
  { key: "nudge", label: "催作业", icon: "M8 2.4a3.4 3.4 0 00-3.4 3.4c0 3-1.2 4.2-1.2 4.2h9.2s-1.2-1.2-1.2-4.2A3.4 3.4 0 008 2.4zM6.6 12.4a1.6 1.6 0 002.8 0" },
  { key: "interactions", label: "互动记录", icon: "M13.4 9.2c0 .9-.7 1.6-1.6 1.6H6.2L3 13.4v-2.6h-.4c-.9 0-1.6-.7-1.6-1.6V4.2c0-.9.7-1.6 1.6-1.6h9.2c.9 0 1.6.7 1.6 1.6z" },
];

export const PAGES: Record<Exclude<NavKey, "students">, { title: string; desc: string; cardTitle: string; cardDesc: string; bullets: string[] }> = {
  enroll: { title: "报课", desc: "把报课表里的报名记录对齐到学员库，邮箱重复即视为同一人。", cardTitle: "这一页还没设计", cardDesc: "先把学员名单做完，报课页会复用同一套表格 + 筛选骨架。", bullets: ["导入一批报课记录，按邮箱匹配已有学员", "未匹配的记录进入待处理队列", "报课记录挂在学员详情的「报课」区块下"] },
  homework: { title: "作业", desc: "按期次和作业轮次查看提交情况。", cardTitle: "这一页还没设计", cardDesc: "预计是「作业轮次 × 学员」的矩阵视图，未提交格子高亮。", bullets: ["按轮次切换，默认看最近一次", "未提交可直接勾选生成催作业名单", "点格子进入单份作业的批改视图"] },
  nudge: { title: "催作业", desc: "对未提交作业的学员按微信逐个跟进。", cardTitle: "这一页还没设计", cardDesc: "依赖学员的微信号字段，未对齐微信的学员会被单独列出。", bullets: ["从作业页生成待催名单", "未对齐微信的学员无法进入催办流程", "催办后写一条互动记录，避免重复打扰"] },
  interactions: { title: "互动记录", desc: "每位学员的沟通与跟进历史，时间倒序。", cardTitle: "这一页还没设计", cardDesc: "一条流水式时间线，来源包括催作业、答疑、人工备注。", bullets: ["记录来源：催作业 / 答疑 / 手动", "支持按学员和时间范围过滤", "在学员详情里内嵌最近 5 条"] },
};

// Duplicated in backend/app/schemas.py (TZ_BY_REGION) — the API computes `tz`
// from the stored region, and this copy renders it in the new-student modal
// before anything is stored. Change one and you must change the other;
// unifying them needs a cross-language generation step, which is out of scope
// here.
export const TZ_BY_REGION: Record<string, string> = { 美西: "UTC-8", 美东: "UTC-5", 加拿大: "UTC-5", 其他地区: "—" };
export const LEVELS = ["小白", "会电脑", "有基础", "工程师"] as const;
export const SOURCES = ["讲武堂", "理财群", "股票群", "加拿大", "Andrew纽约", "其他"];

export const BLANK_FORM: NewStudentForm = {
  name: "",
  email: "",
  wechat: "",
  wxName: "",
  nick: "",
  region: "美西",
  level: "小白",
  source: "讲武堂",
  tags: [],
  note: "",
};

export const FIELDS: { key: EditableFieldKeyLike; label: string; type: "text" | "enum" | "ro"; mono?: boolean; placeholder?: string }[] = [
  // The panel header shows the name too, but that is a display slot. The edit
  // entry point lives here with every other field so one set of rules — inline
  // edit, saving, failure keeps your input — covers all of them.
  { key: "name", label: "姓名", type: "text" },
  { key: "wechat", label: "微信号", type: "text", mono: true, placeholder: "未对齐" },
  { key: "wxName", label: "微信名", type: "text" },
  { key: "nick", label: "微信昵称", type: "text" },
  { key: "region", label: "区域", type: "enum" },
  { key: "level", label: "基础", type: "enum" },
  { key: "source", label: "来源", type: "enum" },
  { key: "industry", label: "行业", type: "text" },
  { key: "gender", label: "性别", type: "enum" },
  { key: "age", label: "年龄", type: "text" },
  { key: "sid", label: "学员 ID", type: "ro", mono: true },
];

type EditableFieldKeyLike = keyof Student | "sid";
