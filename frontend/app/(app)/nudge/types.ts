/** 催作业名单里的一条催促历史：已催或跳过。 */
export interface NudgeEvent {
  /** nudged | skipped */
  type: string;
  /** wechat | email，只在 type === "nudged" 时有意义。 */
  channel: string | null;
  note: string;
  at: string;
}

/** 催作业名单里的一个人——这门课处于"未交"状态。 */
export interface NudgePerson {
  studentEmail: string;
  name: string;
  wechat: string;
  courseId: string;
  overdueDays: number;
  /** 按时间倒序，服务端已经排好序。 */
  history: NudgeEvent[];
  /** 讲师主动跳过——仍在名单里，只是灰显+带标签，不是从名单消失。 */
  skipped: boolean;
}

/** 课程 tab 用的最小形状。 */
export interface NudgeCourse {
  id: string;
  name: string;
}

/** `GET /api/nudge?course=` 的整份响应：未交名单 + 已跳过人数一次带出。 */
export interface NudgeList {
  people: NudgePerson[];
  skippedCount: number;
}
