/** 场次状态。库里存英文 key，中文由界面映射 —— 改文案不该是一次数据迁移。 */
export type SessionState = "pending" | "done" | "cancelled";

export interface CourseSession {
  id: string;
  /** 美西当地日期与时间。存墙上时间而非 UTC 偏移，夏令时切换后它不变。 */
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
  hours: number;
  homework_title: string;
  offline: boolean;
  aliases: CourseAlias[];
  sessions: CourseSession[];
}
