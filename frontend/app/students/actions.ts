"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  archiveStudent,
  createStudent,
  restoreStudent,
  updateStudent,
  BackendError,
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
  revalidatePath("/students");
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
  revalidatePath("/students");
  return { ok: true };
}

export async function archiveStudentAction(email: string): Promise<void> {
  await requireSitePassword();
  await archiveStudent(email);
  revalidatePath("/students");
}

export async function restoreStudentAction(email: string): Promise<void> {
  await requireSitePassword();
  await restoreStudent(email);
  revalidatePath("/students");
}
