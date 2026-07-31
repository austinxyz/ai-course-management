/** 一个分项：列名 + 原始分。没有满分——满分不在 `grades.csv` 里。 */
export interface ScoreItem {
  item: string;
  score: number;
}

/** 作业名单里的一个人。 */
export interface HomeworkPerson {
  studentEmail: string;
  name: string;
  wechat: string;
  /** submitted | missing | not_open | no_session */
  state: string;
  /** 以下全是"交了才有"。没交的人是 null，**不是 0** —— 0 是真实的分数。 */
  submittedAt: string | null;
  total: number | null;
  scores: ScoreItem[];
  highlight: string;
  improve: string;
  /** 原样取自源文件，不归一化。实测取值：待回复 / 草稿已创建。 */
  replyStatus: string;
  /** "session1/grades.csv:7" */
  sourceRef: string;
  rank: number | null;
  rankOf: number;
}

/** 课程 chips 用的最小形状。 */
export interface HomeworkCourse {
  id: string;
  name: string;
  short: string;
}
