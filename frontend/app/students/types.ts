export type Region = "美西" | "美东" | "加拿大" | "其他地区";
export type Level = "小白" | "会电脑" | "有基础" | "工程师";
export type NavKey = "students" | "enroll" | "homework" | "nudge" | "interactions";

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
  Pick<Student, "wechat" | "wxName" | "nick" | "region" | "level" | "source" | "industry" | "gender" | "age" | "note" | "tags">
>;

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
