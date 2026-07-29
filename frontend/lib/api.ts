// server-only module: never import this from a "use client" component.
// (Not using the `server-only` package guard — it throws unconditionally
// outside Next's own build pipeline, which breaks unit testing this file
// directly under vitest.)
import type { Student } from "@/app/students/types";

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

async function backendWrite(
  path: string,
  method: string,
  body?: unknown,
): Promise<ApiStudent> {
  const res = await fetch(backendUrl(path), writeRequestInit(method, body));
  if (!res.ok) {
    const detail = await res
      .json()
      .then((data: { detail?: string }) => data.detail ?? res.statusText)
      .catch(() => res.statusText);
    throw new BackendError(res.status, detail);
  }
  return res.json();
}

export async function getStudents(): Promise<Student[]> {
  const res = await fetch(backendUrl("/api/students"), backendRequestInit());
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

export interface NewStudent {
  email: string;
  name: string;
  region?: string;
  level?: string;
  source?: string;
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
  const data = await backendWrite(
    `/api/students/${encodeURIComponent(email)}`,
    "PATCH",
    toApiPatch(patch),
  );
  return toStudent(data);
}

export async function createStudent(student: NewStudent): Promise<Student> {
  return toStudent(await backendWrite("/api/students", "POST", student));
}

export async function archiveStudent(email: string): Promise<Student> {
  return toStudent(
    await backendWrite(`/api/students/${encodeURIComponent(email)}/archive`, "POST"),
  );
}

export async function restoreStudent(email: string): Promise<Student> {
  return toStudent(
    await backendWrite(`/api/students/${encodeURIComponent(email)}/restore`, "POST"),
  );
}
