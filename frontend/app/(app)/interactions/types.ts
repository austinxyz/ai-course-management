/** 互动记录里的一条：来自 `nudge_events`，学员姓名与课程名一次带出。 */
export interface Interaction {
  studentEmail: string;
  studentName: string;
  courseId: string;
  courseName: string;
  /** nudged | skipped | unskipped */
  eventType: string;
  channel: string | null;
  note: string;
  at: string;
}
