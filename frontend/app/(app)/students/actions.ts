"use server";

import { revalidatePath } from "next/cache";

/**
 * Layout granularity, not the default page granularity.
 *
 * The sidebar's roster badge is rendered by `(app)/layout.tsx`. Page-level
 * revalidation leaves layouts untouched, so the table would refresh while the
 * badge kept showing the previous number — no error, no warning, just a digit
 * that never moves, which looks exactly like having forgotten to revalidate.
 *
 * The path stays `/students`. The docs show a route-group-qualified form
 * (`revalidatePath('/(main)/post/[slug]', 'layout')`), so the group might have
 * needed spelling out; measured against a real write, it does not — the badge
 * goes 10 → 11 without a reload. Worth stating because getting it wrong
 * produces no error, only a badge that never moves.
 */
import { headers } from "next/headers";

import {
  archiveStudent,
  createEnrollment,
  createStudent,
  restoreStudent,
  updateStudent,
  BackendError,
  type NewEnrollment,
  type NewStudent,
  type StudentPatch,
} from "@/lib/api";
import { checkSitePassword } from "@/lib/site-password";

/**
 * Every write goes through here first.
 *
 * A Server Function compiles down to a POST endpoint on the page route. The
 * implementation stays on the server, but the route is reachable by anyone who
 * can send that POST — the Next.js docs are explicit that rendering a form only
 * on a gated page is not a security boundary. `proxy.ts` covering the page load
 * therefore proves nothing about the action, and this check is not a duplicate
 * of it.
 *
 * Failing this throws rather than returning an error result: a rejected write
 * must not read as a write that merely didn't change anything.
 */
async function requireSitePassword(): Promise<void> {
  const requestHeaders = await headers();
  if (!checkSitePassword(requestHeaders.get("Authorization"))) {
    throw new Error("Unauthorized");
  }
}

export async function updateStudentField(
  email: string,
  patch: StudentPatch,
): Promise<void> {
  await requireSitePassword();
  await updateStudent(email, patch);
  revalidatePath("/students", "layout");
}

/**
 * A refusal the caller is expected to act on, distinct from a crash.
 *
 * `archived` and `exists` need different remedies — restore that person versus
 * open them — so the UI has to be able to tell them apart.
 */
export type CreateResult =
  | { ok: true }
  | { ok: false; kind: "archived" | "exists" | "other"; message: string };

function classify(error: unknown): CreateResult {
  if (error instanceof BackendError && error.status === 409) {
    return /archiv/i.test(error.detail)
      ? { ok: false, kind: "archived", message: error.detail }
      : { ok: false, kind: "exists", message: error.detail };
  }
  return { ok: false, kind: "other", message: "没保存上。" };
}

export async function createStudentAction(
  student: NewStudent,
): Promise<CreateResult> {
  await requireSitePassword();
  try {
    await createStudent(student);
  } catch (error) {
    // Returned, not thrown. A duplicate email is an ordinary outcome of this
    // form, and Next.js redacts thrown Server Action errors in production
    // builds — the detail the UI needs to tell the two collisions apart would
    // survive locally and vanish once deployed, which is the worst possible
    // place for it to differ.
    return classify(error);
  }
  revalidatePath("/students", "layout");
  return { ok: true };
}

export async function archiveStudentAction(email: string): Promise<void> {
  await requireSitePassword();
  await archiveStudent(email);
  revalidatePath("/students", "layout");
}

export async function restoreStudentAction(email: string): Promise<void> {
  await requireSitePassword();
  await restoreStudent(email);
  revalidatePath("/students", "layout");
}

/**
 * 补录一条报课。
 *
 * 预期内的失败（重复、课已下线）用**返回值**表达而不是抛：Next 在生产构建里
 * 把 Server Action 抛出的错误抹成一个 digest，客户端拿不到原文——本地 dev
 * 一切正常，上线后引导文案静默消失。判据是"用户正常操作会不会撞到"：会，就是返回值。
 */
export async function createEnrollmentAction(
  draft: NewEnrollment,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireSitePassword();
  try {
    await createEnrollment(draft);
  } catch (error) {
    if (error instanceof BackendError) return { ok: false, message: error.detail };
    return { ok: false, message: "没保存上。" };
  }
  revalidatePath("/students", "layout");
  return { ok: true };
}
