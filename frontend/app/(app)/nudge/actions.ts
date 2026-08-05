"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { BackendError, createNudgeEvent } from "@/lib/api";
import { checkSitePassword } from "@/lib/site-password";

/** 每个入口先过这里。理由同 `homework/actions.ts` 的 `requireSitePassword`。 */
async function requireSitePassword(): Promise<void> {
  const requestHeaders = await headers();
  if (!checkSitePassword(requestHeaders.get("Authorization"))) {
    throw new Error("Unauthorized");
  }
}

export type NudgeActionResult = { ok: true } | { ok: false; message: string };

function classify(error: unknown): { ok: false; message: string } {
  if (error instanceof BackendError) {
    return { ok: false, message: error.detail };
  }
  return { ok: false, message: "没能保存，请稍后再试。" };
}

async function record(
  studentEmail: string,
  courseId: string,
  eventType: "nudged" | "skipped" | "unskipped",
): Promise<NudgeActionResult> {
  await requireSitePassword();
  try {
    await createNudgeEvent({ studentEmail, courseId, eventType });
  } catch (error) {
    return classify(error);
  }
  // 名单、已催次数、上次催促时间都要跟着变——布局粒度同 homework/enrollments 的既有先例。
  revalidatePath("/nudge", "layout");
  return { ok: true };
}

/** 讲师标记已催。不会把这个人从名单移除——他还是没交。 */
export async function markNudged(studentEmail: string, courseId: string): Promise<NudgeActionResult> {
  return record(studentEmail, courseId, "nudged");
}

/** 讲师跳过这条未交——仍在名单里，灰显+带"已跳过"标签，不是消失。 */
export async function skipNudge(studentEmail: string, courseId: string): Promise<NudgeActionResult> {
  return record(studentEmail, courseId, "skipped");
}

/** 讲师撤销跳过，该学员重新按真实作业状态参与"未交"判定。 */
export async function unskipNudge(studentEmail: string, courseId: string): Promise<NudgeActionResult> {
  return record(studentEmail, courseId, "unskipped");
}
