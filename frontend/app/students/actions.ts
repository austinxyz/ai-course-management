"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  archiveStudent,
  createStudent,
  restoreStudent,
  updateStudent,
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

export async function createStudentAction(student: NewStudent): Promise<void> {
  await requireSitePassword();
  await createStudent(student);
  revalidatePath("/students");
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
