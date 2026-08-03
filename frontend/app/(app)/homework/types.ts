/**
 * 一个分项：列名 + 原始分 + 满分（`max`）。
 *
 * 满分不在 `grades.csv` 里，是应用内单独维护的课程级配置（见课程页的评分标准
 * 维护入口），未配置时为 `null`——这种情况下只显示原始分，不显示比例条形图。
 */
export interface ScoreItem {
  item: string;
  score: number;
  max: number | null;
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
  /** 原样取自源文件，不归一化。实测取值：待回复 / 草稿已创建。与 `replied` 是两个独立信号。 */
  replyStatus: string;
  /** "session1/grades.csv:7" */
  sourceRef: string;
  rank: number | null;
  rankOf: number;
  /** 没交的人是 null——标记只对已交的提交有意义。 */
  submissionId: string | null;
  /** 讲师手动标记，独立于 `replyStatus`，不受重新导入影响。「待回复」筛选看这个字段。 */
  replied: boolean;
  repliedAt: string | null;
  /** 这门课全部分项都配了满分时是各分项满分之和，否则为 `null`——
   * 满分总和少一项就等于分母算错了，宁可不显示也不显示一个基于错误分母的比例。 */
  totalMax: number | null;
  /** 批改报告导入写下的逐分项评语，只含被勾选写入的那些。 */
  dimensionComments: DimensionComment[];
  /** 真表示 highlight/improve 来自批改报告导入，重新导入 grades.csv 不会再碰它们。 */
  highlightLocked: boolean;
}

/** 批改报告导入写下的一条分项评语。跟 `scores` 同一个形状。 */
export interface DimensionComment {
  item: string;
  comment: string;
}

/** 报告预览里的一个分项：编号 + 报告给出的得分/满分/评语 + 是否与现有分数不一致。 */
export interface ReportDimension {
  code: string;
  score: number;
  max: number;
  comment: string;
  mismatch: boolean;
}

/** 一次报告上传的解析结果。dry-run 与真跑同一个形状。 */
export interface ReportPreview {
  items: ReportDimension[];
  highlight: string;
  improve: string;
  totalMismatch: boolean;
}

/** 课程 chips 用的最小形状。 */
export interface HomeworkCourse {
  id: string;
  name: string;
  short: string;
}

/**
 * 上传文件的分项列与该课程既有成绩不符。
 *
 * 两边都带上：这个信号最常见的成因是**传错了课程**，而只说"不一致"
 * 表达不了这件事。它是警告不是拒绝——课程真的改了评分表是合法的。
 */
export interface HeaderMismatch {
  fileItems: string[];
  existingItems: string[];
}

/**
 * 预览里将写入的一行。
 *
 * 姓名只为可读，关联一律走邮箱。「以后不算作业」挂在这些行上——
 * 会被写进去的行恰恰最需要它：讲师本人一旦进了学员表，
 * 他的测试提交就从"跳过"变成"将写入"。
 */
export interface ImportRow {
  email: string;
  name: string;
  total: number;
  /** create | update */
  action: string;
}

/**
 * 一次导入的判断结果。dry-run 与真跑**同一个形状**。
 *
 * 全部来自后端。前端一个字段都不自己算——算出来的数会与后端不一致，
 * 而不一致只在写入之后才暴露。
 */
export interface ImportResult {
  /** **始终**显示，包括判定为 UTF-8 时。只在异常时出现的话，用户不知道正常长什么样。 */
  encoding: string;
  rowCount: number;
  created: number;
  updated: number;
  /** 邮箱本来不在学员表：系统已用占位信息自动建档、建报课，成绩**已写入**。建议之后回填真实信息。 */
  autoCreated: string[];
  /** 学员在册但这门课没报课：成绩**写了**，但页面上一行都不会出现。要补报课。 */
  skippedNoEnrollment: string[];
  /** 被同一人更晚的一次提交顶掉的行（`文件:行号`）。 */
  superseded: string[];
  /** 邮箱为空的行（`文件:行号`）。 */
  rowsWithoutEmail: string[];
  /** 命中排除名单、因而没有写入的邮箱。 */
  excluded: string[];
  /** 将写入的那些人，逐行。 */
  rows: ImportRow[];
  headerWarning: HeaderMismatch | null;
}

/** 作业页上的「上次导入 …」。还没导过就是 null。 */
export interface LastImport {
  filename: string;
  encoding: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  importedAt: string;
}
