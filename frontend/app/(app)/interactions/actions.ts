"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { BackendError, createInteraction, deleteInteraction, type NewInteractionWrite } from "@/lib/api";
import { checkSitePassword } from "@/lib/site-password";

/** 每个入口先过这里。理由同 `students/actions.ts` 的 `requireSitePassword`。 */
async function requireSitePassword(): Promise<void> {
  const requestHeaders = await headers();
  if (!checkSitePassword(requestHeaders.get("Authorization"))) {
    throw new Error("Unauthorized");
  }
}

/**
 * 手动录入一条互动记录，或打一条参与度信号——由 `draft.kind` 区分，两者
 * 共用同一个写入口与同一套刷新逻辑（design.md 决定 5）。
 *
 * 写入后同时出现在三处消费方——独立页自身、详情面板（`/students` layout）、
 * 侧边栏徽标（`/interactions` layout 覆盖）。两次 `revalidatePath` 各自覆盖
 * 各自的缓存条目，理由同上一轮 `interactions-manual-entry` design.md 决定 5。
 */
export async function createInteractionAction(
  draft: NewInteractionWrite,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireSitePassword();
  try {
    await createInteraction(draft);
  } catch (error) {
    if (error instanceof BackendError) return { ok: false, message: error.detail };
    return { ok: false, message: "没保存上。" };
  }
  revalidatePath("/interactions", "layout");
  revalidatePath("/students", "layout");
  return { ok: true };
}

/**
 * 删除一条人工录入/参与度信号记录。后端会拒绝其余类型
 * （design.md 决定 2），这里只透传返回值，不重复做前端侧的类型判断。
 * 刷新逻辑跟写入共用同一套两次 `revalidatePath`。
 */
export async function deleteInteractionAction(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireSitePassword();
  try {
    await deleteInteraction(id);
  } catch (error) {
    if (error instanceof BackendError) return { ok: false, message: error.detail };
    return { ok: false, message: "没删掉。" };
  }
  revalidatePath("/interactions", "layout");
  revalidatePath("/students", "layout");
  return { ok: true };
}
