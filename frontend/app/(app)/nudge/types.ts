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
}

/** 课程 tab 用的最小形状。 */
export interface NudgeCourse {
  id: string;
  name: string;
}
