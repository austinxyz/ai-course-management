/** 互动记录里的一条：来自 `nudge_events`，学员姓名与课程名一次带出。`id`
 * 是删除时唯一安全的定位符——不能靠"学员+时间+类型"这种组合，可能撞车
 * （`interactions-confirm-and-undo` design.md 决定 1）。 */
export interface Interaction {
  id: string;
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
