/** 场次状态。库里存英文 key，中文由界面映射 —— 改文案不该是一次数据迁移。 */
export type SessionState = "pending" | "done" | "cancelled";

export interface CourseSession {
  id: string;
  /** 该场次所属时区的当地日期与时间（时区见下方 tz）。存墙上时间而非 UTC 偏移，夏令时切换后它不变。 */
  local_date: string;
  local_time: string;
  tz: string;
  teacher: string;
  note: string;
  /** 后端用 zoneinfo 算好的绝对时刻。前端只负责把它格式化到各时区。 */
  starts_at: string;
  state: SessionState;
  /** 真表示这是人工覆盖，界面据此显示「恢复跟随日期」而不是「跟随日期」。 */
  state_is_override: boolean;
}

export interface CourseAlias {
  /** 用户当初的写法。匹配用的归一化值是后端的事，不外露。 */
  raw: string;
}

export interface Course {
  id: string;
  name: string;
  short: string;
  tagline: string;
  intro: string;
  /** 分钟，不是小时：真实课程 150 分钟，整小时表达不了。 */
  duration_minutes: number;
  homework_title: string;
  offline: boolean;
  /** 新增场次时预选的时区。只影响将来，不回溯已有场次。 */
  default_tz: string;
  aliases: CourseAlias[];
  sessions: CourseSession[];
}
