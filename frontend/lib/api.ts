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

export async function getStudents(): Promise<Student[]> {
  const res = await fetch(backendUrl("/api/students"), {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`getStudents failed: ${res.status}`);
  const data: ApiStudent[] = await res.json();
  return data.map(toStudent);
}

export async function getStudent(email: string): Promise<Student | null> {
  const res = await fetch(backendUrl(`/api/students/${encodeURIComponent(email)}`), {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getStudent failed: ${res.status}`);
  const data: ApiStudent = await res.json();
  return toStudent(data);
}
