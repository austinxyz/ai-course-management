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
