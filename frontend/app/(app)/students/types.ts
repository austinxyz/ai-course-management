export type Region = "美西" | "美东" | "加拿大" | "其他地区";
export type Level = "小白" | "会电脑" | "有基础" | "工程师";
export type NavKey = "students" | "courses" | "enroll" | "homework" | "nudge" | "interactions";

export interface Student {
  name: string;
  email: string;
  gender: string;
  age: string;
  industry: string;
  wechat: string;
  nick: string;
  wxName: string;
  source: string;
  region: Region;
  tz: string;
  level: Level;
  tags: string[];
  note: string;
}

export type StudentOverride = Partial<
  Pick<Student, "name" | "wechat" | "wxName" | "nick" | "region" | "level" | "source" | "industry" | "gender" | "age" | "note" | "tags">
>;

/**
 * Everything the detail panel can write, including the two that are not rows
 * in the field table. `tags` used to reach `saveField` through a cast to
 * `EditableFieldKey`, which silenced the type checker on a value that key does
 * not contain — and with it the fact that tags had no status UI at all.
 */
export type WritableFieldKey = EditableFieldKey | "note" | "tags";

/**
 * Per-field write state.
 *
 * `failed` carries the attempted value, not just a message: the field goes
 * back to being editable with what the user typed still in it. Reverting to
 * the stored value would discard the newer information — usually a wechat
 * handle, which costs a manual match against a group roster to obtain.
 */
export type FieldStatus =
  | { state: "saving" }
  | { state: "failed"; value: string | string[]; message: string };

export interface NewStudentForm {
  name: string;
  email: string;
  wechat: string;
  wxName: string;
  nick: string;
  region: Region;
  level: Level;
  source: string;
  tags: string[];
  note: string;
}

export type EditableFieldKey =
  | "name"
  | "wechat"
  | "wxName"
  | "nick"
  | "region"
  | "level"
  | "source"
  | "industry"
  | "gender"
  | "age"
  | "note";

/** 一条报课。`state` 是**服务端算出来的**，前端只渲染，不自己按日期推。 */
export interface Enrollment {
  id: string;
  studentEmail: string;
  courseId: string;
  courseName: string;
  /** null = 还没定上哪一场。是需要跟进的状态，不是缺陷。 */
  sessionId: string | null;
  sessionDate: string | null;
  enrolledAt: string;
  /** enrolled | completed | withdrawn —— 由后端派生，见 enrollment 能力。 */
  state: string;
  source: string;
  note: string;
}
