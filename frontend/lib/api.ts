// server-only module: never import this from a "use client" component.
// (Not using the `server-only` package guard — it throws unconditionally
// outside Next's own build pipeline, which breaks unit testing this file
// directly under vitest.)
import type { Course } from "@/app/(app)/courses/types";
import type {
  HomeworkPerson,
  ImportResult,
  LastImport,
} from "@/app/(app)/homework/types";
import type { Enrollment, Student } from "@/app/(app)/students/types";

interface ApiStudent {
  email: string;
  name: string;
  wechat: string;
  wx_name: string;
  nick: string;
  region: string;
  tz: string;
  level: string;
  source: string;
  tags: string[];
  note: string;
  gender: string;
  age: string;
  industry: string;
}

function toStudent(api: ApiStudent): Student {
  const { wx_name, ...rest } = api;
  return { ...rest, wxName: wx_name } as Student;
}

function backendUrl(path: string): string {
  const base = process.env.BACKEND_URL;
  if (!base) throw new Error("BACKEND_URL is not configured");
  return `${base}${path}`;
}

/**
 * Give up well before the serverless function's own execution limit.
 *
 * The backend runs on Render's free tier and sleeps after inactivity, so a
 * cold start can take the better part of a minute. Waiting it out is not an
 * option: if the fetch is still open when the platform's function limit hits,
 * the whole invocation is killed and `error.tsx` never gets to render — the
 * user sees a platform 504 rather than our error card with its retry button.
 *
 * So we abort first, deliberately trading a possible successful cold start for
 * a UI that can explain itself and offer a retry (by which point the backend is
 * usually awake).
 */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Options every backend call shares.
 *
 * The secret header is what distinguishes this server-side fetch from anyone
 * else who has found the backend's URL; without it the backend answers 401.
 * It is read from a plain (non-`NEXT_PUBLIC_`) variable so it stays on the
 * server — prefixing it would compile the secret into the browser bundle and
 * hand it to every visitor.
 */
function backendRequestInit(): RequestInit {
  return {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "X-Backend-Secret": process.env.BACKEND_SECRET ?? "" },
  };
}

function writeRequestInit(method: string, body?: unknown): RequestInit {
  const base = backendRequestInit();
  return {
    ...base,
    method,
    headers: { ...(base.headers as Record<string, string>), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

/**
 * Carries the backend's status code so callers can tell the failures apart.
 *
 * A duplicate email (409) needs a different message from a validation error
 * (422), and a duplicate that belongs to an archived student needs a different
 * one again — collapsing them into a generic "save failed" would leave the
 * user with no idea what to do next.
 */
export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "BackendError";
  }
}

/**
 * 把后端的 `detail` 收成一句人能读的话。
 *
 * FastAPI 的 422 里 detail 不是字符串，而是一个数组，元素形如
 * `{type, loc, msg, input, ctx}`。之前这里把它**声明**成 string 就直接传下去 ——
 * 类型撒了谎，那个对象一路流到 JSX，React 抛
 * "Objects are not valid as a React child"，用户看到的是整页崩溃，
 * 而不是"这个日期格式不对"。类型断言挡不住外部数据，只有在边界上收敛才行。
 */
function describeDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const { loc, msg } = item as { loc?: unknown[]; msg?: unknown };
          // loc 形如 ["body", "local_date"]——只取字段名，"body" 对用户没有意义。
          const field = Array.isArray(loc)
            ? loc.filter((p) => typeof p === "string" && p !== "body").join(".")
            : "";
          const text = typeof msg === "string" ? msg : "";
          return [field, text].filter(Boolean).join("：");
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("；");
  }

  return fallback;
}


/**
 * 写请求的公共壳：拼 URL、带凭据、把后端的 detail 抬成 BackendError。
 *
 * 返回 `unknown` 而不是某个具体形状——学员与课程两条线的响应形状不同，
 * 由各自的调用点断言。写在这里会让其中一方的类型悄悄变成另一方的。
 */
async function backendWrite(
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(backendUrl(path), writeRequestInit(method, body));
  if (!res.ok) {
    const detail = await res
      .json()
      .then((data: { detail?: unknown }) => describeDetail(data.detail, res.statusText))
      .catch(() => res.statusText);
    throw new BackendError(res.status, detail);
  }
  // 204 没有 body。无条件 `res.json()` 会在解析空 body 时抛异常，于是一次**成功**的
  // 删除被上层当成失败：界面报"没删掉"、revalidatePath 不执行、那一行留在屏幕上，
  // 而记录其实已经没了。症状与"真的删不掉"一模一样，只有刷新才看得出区别。
  if (res.status === 204) return undefined;
  return res.json();
}

export async function getStudents(
  options: { archived?: boolean } = {},
): Promise<Student[]> {
  const path = options.archived ? "/api/students?archived=true" : "/api/students";
  const res = await fetch(backendUrl(path), backendRequestInit());
  if (!res.ok) throw new Error(`getStudents failed: ${res.status}`);
  const data: ApiStudent[] = await res.json();
  return data.map(toStudent);
}

export async function getStudent(email: string): Promise<Student | null> {
  const res = await fetch(
    backendUrl(`/api/students/${encodeURIComponent(email)}`),
    backendRequestInit(),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getStudent failed: ${res.status}`);
  const data: ApiStudent = await res.json();
  return toStudent(data);
}

/** Fields a caller may change. Email is absent: it is the primary key. */
export type StudentPatch = Partial<
  Pick<
    Student,
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
    | "note"
    | "tags"
  >
>;

/**
 * Everything the new-student modal collects.
 *
 * The optional fields are not decoration: the modal asks for them, so leaving
 * them off this type silently drops whatever the user typed. The wechat handle
 * is the one that hurts — it takes a manual match against a group roster to
 * obtain, and creation is the moment it is most likely to be at hand.
 */
export interface NewStudent {
  email: string;
  name: string;
  region?: string;
  level?: string;
  source?: string;
  wechat?: string;
  wxName?: string;
  nick?: string;
  note?: string;
  tags?: string[];
}

function toApiPatch(patch: StudentPatch): Record<string, unknown> {
  // Only keys the caller actually supplied are forwarded. The backend
  // distinguishes an absent field from one set to "" — dropping that
  // distinction here would make clearing a note a silent no-op.
  const { wxName, ...rest } = patch;
  return wxName === undefined ? { ...rest } : { ...rest, wx_name: wxName };
}

export async function updateStudent(
  email: string,
  patch: StudentPatch,
): Promise<Student> {
  const data = (await backendWrite(
    `/api/students/${encodeURIComponent(email)}`,
    "PATCH",
    toApiPatch(patch),
  )) as ApiStudent;
  return toStudent(data);
}

export async function createStudent(student: NewStudent): Promise<Student> {
  const { wxName, ...rest } = student;
  // The backend field is wx_name; sending wxName would be quietly ignored and
  // the value lost, which is the same failure as not sending it at all.
  const body = wxName === undefined ? rest : { ...rest, wx_name: wxName };
  return toStudent((await backendWrite("/api/students", "POST", body)) as ApiStudent);
}

export async function archiveStudent(email: string): Promise<Student> {
  return toStudent(
    (await backendWrite(
      `/api/students/${encodeURIComponent(email)}/archive`,
      "POST",
    )) as ApiStudent,
  );
}

export async function restoreStudent(email: string): Promise<Student> {
  return toStudent(
    (await backendWrite(
      `/api/students/${encodeURIComponent(email)}/restore`,
      "POST",
    )) as ApiStudent,
  );
}


/**
 * 课程、别名与场次一次取全。
 *
 * 后端把三者装在一个响应里：课程页要同时显示它们，分三个请求只会让页面分三次抖动。
 * 字段名与后端一致（snake_case），所以这里不做 toStudent 那样的映射——
 * 少一层映射就少一处"漏映射导致值静默丢失"的地方。
 */
export async function getCourses(): Promise<Course[]> {
  const res = await fetch(backendUrl("/api/courses"), backendRequestInit());
  if (!res.ok) throw new Error(`getCourses failed: ${res.status}`);
  return res.json();
}

/** 已有场次上出现过的讲师，去重排序。新增场次时当选项。 */
export async function getTeachers(): Promise<string[]> {
  const res = await fetch(backendUrl("/api/courses/teachers"), backendRequestInit());
  if (!res.ok) throw new Error(`getTeachers failed: ${res.status}`);
  return res.json();
}


export interface CoursePatch {
  name?: string;
  short?: string;
  tagline?: string;
  intro?: string;
  duration_minutes?: number;
  default_tz?: string;
  homework_title?: string;
  offline?: boolean;
}

export interface SessionPatch {
  local_date?: string;
  local_time?: string;
  tz?: string;
  teacher?: string;
  note?: string;
  state_override?: "pending" | "done" | "cancelled";
}

export async function createCourse(body: CoursePatch): Promise<Course> {
  return backendWrite("/api/courses", "POST", body) as Promise<Course>;
}

export async function updateCourse(id: string, body: CoursePatch): Promise<Course> {
  return backendWrite(`/api/courses/${id}`, "PATCH", body) as Promise<Course>;
}

export async function addAlias(id: string, raw: string): Promise<Course> {
  return backendWrite(`/api/courses/${id}/aliases`, "POST", { raw }) as Promise<Course>;
}

export async function removeAlias(id: string, raw: string): Promise<Course> {
  return backendWrite(
    `/api/courses/${id}/aliases/${encodeURIComponent(raw)}`,
    "DELETE",
  ) as Promise<Course>;
}

export async function addSession(id: string, body: SessionPatch): Promise<Course> {
  return backendWrite(`/api/courses/${id}/sessions`, "POST", body) as Promise<Course>;
}

export async function updateSession(
  id: string,
  sessionId: string,
  body: SessionPatch,
): Promise<Course> {
  return backendWrite(
    `/api/courses/${id}/sessions/${sessionId}`,
    "PATCH",
    body,
  ) as Promise<Course>;
}

/** 清除人工状态。是个动作而非 PATCH null —— 显式 null 在更新请求里被拒。 */
export async function followSessionDate(id: string, sessionId: string): Promise<Course> {
  return backendWrite(
    `/api/courses/${id}/sessions/${sessionId}/follow-date`,
    "POST",
  ) as Promise<Course>;
}

export async function deleteSession(id: string, sessionId: string): Promise<Course> {
  return backendWrite(
    `/api/courses/${id}/sessions/${sessionId}`,
    "DELETE",
  ) as Promise<Course>;
}

/**
 * 报课记录的线上形状。蛇形是后端的口径，前端类型用驼峰——
 * 映射只在这一层做一次，漏一个字段的症状是"填了却没保存上"。
 */
interface ApiEnrollment {
  id: string;
  student_email: string;
  course_id: string;
  course_name: string;
  session_id: string | null;
  session_date: string | null;
  enrolled_at: string;
  state: string;
  source: string;
  note: string;
}

function toEnrollment(api: ApiEnrollment): Enrollment {
  return {
    id: api.id,
    studentEmail: api.student_email,
    courseId: api.course_id,
    courseName: api.course_name,
    sessionId: api.session_id,
    sessionDate: api.session_date,
    enrolledAt: api.enrolled_at,
    state: api.state,
    source: api.source,
    note: api.note,
  };
}

export async function getEnrollments(): Promise<Enrollment[]> {
  const res = await fetch(backendUrl("/api/enrollments"), backendRequestInit());
  if (!res.ok) throw new Error(`getEnrollments failed: ${res.status}`);
  const data: ApiEnrollment[] = await res.json();
  return data.map(toEnrollment);
}

export interface NewEnrollment {
  studentEmail: string;
  courseId: string;
  sessionId: string | null;
  enrolledAt: string;
  note: string;
}

export async function createEnrollment(draft: NewEnrollment): Promise<Enrollment> {
  // 四个字段全都送出去，不只必填的两个：后端对其余几项都有默认值，
  // 漏送不会报错，症状是"我填的备注没保存上"。
  const data = (await backendWrite("/api/enrollments", "POST", {
    student_email: draft.studentEmail,
    course_id: draft.courseId,
    session_id: draft.sessionId,
    enrolled_at: draft.enrolledAt,
    note: draft.note,
  })) as ApiEnrollment;
  return toEnrollment(data);
}

export async function updateEnrollmentSession(
  id: string,
  sessionId: string | null,
): Promise<Enrollment> {
  // `null` 在这里是**合法输入**（清空场次），不是"没提到这个字段"——
  // 该列本来就可空，而清空是补课流程唯一的表达方式。
  const data = (await backendWrite(`/api/enrollments/${id}`, "PATCH", {
    session_id: sessionId,
  })) as ApiEnrollment;
  return toEnrollment(data);
}

export async function deleteEnrollment(id: string): Promise<void> {
  await backendWrite(`/api/enrollments/${id}`, "DELETE");
}

/**
 * 作业名单的线上形状。蛇形是后端的口径，前端类型用驼峰——
 * 映射只在这一层做一次，漏一个字段的症状是"值悄悄不见了"。
 */
interface ApiHomeworkPerson {
  student_email: string;
  name: string;
  wechat: string;
  state: string;
  submitted_at: string | null;
  total: number | null;
  scores: { item: string; score: number }[];
  highlight: string;
  improve: string;
  reply_status: string;
  source_ref: string;
  rank: number | null;
  rank_of: number;
}

/**
 * 一门课的作业名单。
 *
 * 只有读。同步是本地命令行的事——`grades.csv` 在另一个仓库，
 * 部署环境的后端看不到那些文件，所以这里**不存在**对应的写方法。
 */
interface ApiImportResult {
  encoding: string;
  row_count: number;
  created: number;
  updated: number;
  skipped_no_student: string[];
  skipped_no_enrollment: string[];
  superseded: string[];
  rows_without_email: string[];
  excluded: string[];
  rows: { email: string; name: string; total: number; action: string }[];
  header_warning: { file_items: string[]; existing_items: string[] } | null;
}

/**
 * 把一份 `grades.csv` 的**原始字节**送去后端导入。
 *
 * 这一层只搬运：解码、解析、校验、排除、分类全部在后端，因为已知的下一个
 * 调用方是 MCP，它不经过 Next.js。任何落在这条路径上的规则都会被那条绕过，
 * 而两个客户端行为不一致只在"命令行导进去的和网页导进去的不一样"时才暴露。
 *
 * 送的是 base64 的字节而不是文本：编码判定必须拿到原始字节。
 */
export async function importHomework(input: {
  contentBase64: string;
  filename: string;
  courseId: string;
  dryRun: boolean;
}): Promise<ImportResult> {
  const data = (await backendWrite(
    `/api/homework/import?dry_run=${input.dryRun ? "true" : "false"}`,
    "POST",
    {
      content_base64: input.contentBase64,
      filename: input.filename,
      course_id: input.courseId,
    },
  )) as ApiImportResult;
  return {
    encoding: data.encoding,
    rowCount: data.row_count,
    created: data.created,
    updated: data.updated,
    skippedNoStudent: data.skipped_no_student,
    skippedNoEnrollment: data.skipped_no_enrollment,
    superseded: data.superseded,
    rowsWithoutEmail: data.rows_without_email,
    excluded: data.excluded,
    rows: data.rows,
    headerWarning: data.header_warning
      ? {
          fileItems: data.header_warning.file_items,
          existingItems: data.header_warning.existing_items,
        }
      : null,
  };
}

/** 把一个邮箱**永久**加入「不算作业」名单。全课程通用。 */
export async function addExcludedEmail(email: string): Promise<void> {
  await backendWrite("/api/homework/excluded", "POST", { email });
}

interface ApiLastImport {
  filename: string;
  encoding: string;
  row_count: number;
  created_count: number;
  updated_count: number;
  imported_at: string;
}

/** 这门课最近一次导入。还没导过就是 `null`——"还没有"不是错误。 */
export async function getLastImport(courseId: string): Promise<LastImport | null> {
  const res = await fetch(
    backendUrl(`/api/homework/last-import?course=${encodeURIComponent(courseId)}`),
    backendRequestInit(),
  );
  if (!res.ok) throw new Error(`getLastImport failed: ${res.status}`);
  const data: ApiLastImport | null = await res.json();
  if (data === null) return null;
  return {
    filename: data.filename,
    encoding: data.encoding,
    rowCount: data.row_count,
    createdCount: data.created_count,
    updatedCount: data.updated_count,
    importedAt: data.imported_at,
  };
}

export async function getHomework(courseId: string): Promise<HomeworkPerson[]> {
  const res = await fetch(
    backendUrl(`/api/homework?course=${encodeURIComponent(courseId)}`),
    backendRequestInit(),
  );
  if (!res.ok) throw new Error(`getHomework failed: ${res.status}`);
  const data: ApiHomeworkPerson[] = await res.json();
  return data.map((api) => ({
    studentEmail: api.student_email,
    name: api.name,
    wechat: api.wechat,
    state: api.state,
    submittedAt: api.submitted_at,
    total: api.total,
    scores: api.scores,
    highlight: api.highlight,
    improve: api.improve,
    replyStatus: api.reply_status,
    sourceRef: api.source_ref,
    rank: api.rank,
    rankOf: api.rank_of,
  }));
}
