"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  BackendError,
  addAlias,
  addSession,
  createCourse,
  deleteSession,
  followSessionDate,
  removeAlias,
  updateCourse,
  updateSession,
  type CoursePatch,
  type SessionPatch,
} from "@/lib/api";
import { checkSitePassword } from "@/lib/site-password";

/**
 * 每个 action 自己校验一遍凭据。
 *
 * Server Function 编译成页面路由上的一个 POST 端点，能发这个 POST 的人就能到这里 ——
 * `proxy.ts` 盖住页面加载证明不了什么。写入被绕过是数据被篡改，比读取被绕过更重。
 */
async function requireSitePassword(): Promise<void> {
  const requestHeaders = await headers();
  if (!checkSitePassword(requestHeaders.get("Authorization"))) {
    throw new Error("Unauthorized");
  }
}

/**
 * 调用方要处理的结果，与崩溃区分开。
 *
 * 用返回值而不是抛异常：生产构建里 Next 只把 digest 传给客户端，
 * 抛出来的 message 拿不到 —— 学员那边已经吃过一次这个亏（正则匹配 error.message 静默失效）。
 * 判断标准是"用户正常操作能不能撞到"：别名被占用能撞到，所以是返回值。
 */
export type ActionResult = { ok: true } | { ok: false; message: string };

async function run(operation: () => Promise<unknown>): Promise<ActionResult> {
  await requireSitePassword();
  try {
    await operation();
  } catch (error) {
    if (error instanceof BackendError) return { ok: false, message: error.detail };
    throw error;
  }
  revalidatePath("/courses");
  return { ok: true };
}

export async function createCourseAction(body: CoursePatch): Promise<ActionResult> {
  return run(() => createCourse(body));
}

export async function updateCourseAction(
  id: string,
  body: CoursePatch,
): Promise<ActionResult> {
  return run(() => updateCourse(id, body));
}

export async function addAliasAction(id: string, raw: string): Promise<ActionResult> {
  return run(() => addAlias(id, raw));
}

export async function removeAliasAction(id: string, raw: string): Promise<ActionResult> {
  return run(() => removeAlias(id, raw));
}

export async function addSessionAction(
  id: string,
  body: SessionPatch,
): Promise<ActionResult> {
  return run(() => addSession(id, body));
}

export async function updateSessionAction(
  id: string,
  sessionId: string,
  body: SessionPatch,
): Promise<ActionResult> {
  return run(() => updateSession(id, sessionId, body));
}

export async function followDateAction(
  id: string,
  sessionId: string,
): Promise<ActionResult> {
  return run(() => followSessionDate(id, sessionId));
}

export async function deleteSessionAction(
  id: string,
  sessionId: string,
): Promise<ActionResult> {
  return run(() => deleteSession(id, sessionId));
}
