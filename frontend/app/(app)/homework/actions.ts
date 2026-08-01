"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  BackendError,
  addExcludedEmail,
  importHomework,
} from "@/lib/api";
import { checkSitePassword } from "@/lib/site-password";

import type { ImportResult } from "./types";

/**
 * 每个入口先过这里。
 *
 * Server Function 编译成页面路由上的一个 POST 端点。实现留在服务端，
 * 但那条路由谁能发 POST 谁就到得了——Next.js 的文档明确说过，
 * 「表单只渲染在受保护的页面上」不是安全边界。`proxy.ts` 覆盖页面加载
 * 因此对这个 action 什么都不证明，这次检查不是它的重复。
 *
 * 这里**抛异常**而不是返回错误结果：被拒绝的写入不能读成"写了但没改动"。
 * 与下面那些预期内的失败正好相反——那些是用户正常操作能撞到的。
 */
async function requireSitePassword(): Promise<void> {
  const requestHeaders = await headers();
  if (!checkSitePassword(requestHeaders.get("Authorization"))) {
    throw new Error("Unauthorized");
  }
}

/**
 * 预期内的结果用**返回值**表达。
 *
 * 编码不对、表头不符、课程不存在、体积超限——全是用户正常操作能撞到的。
 * Server Action 抛出的错误在生产构建里只剩一个 digest，客户端拿不到内容：
 * 本地看得见的那句话部署之后就没了，而这是最坏的一种"只在生产上不一样"。
 */
export type ImportActionResult =
  | { ok: true; result: ImportResult }
  | { ok: false; message: string };

/** 没有结果要带回去的写入（标记排除）。 */
export type SimpleActionResult = { ok: true } | { ok: false; message: string };

function classify(error: unknown): { ok: false; message: string } {
  if (error instanceof BackendError) {
    return { ok: false, message: error.detail };
  }
  return { ok: false, message: "导入没能完成，请稍后再试。" };
}

/**
 * 读文件 → base64 → 转发。**一行业务逻辑都不放。**
 *
 * 用 `arrayBuffer()` 而不是 `text()`：`text()` 会按 UTF-8 解一遍，
 * 一份 GBK 文件到这一步就已经变成替换字符了，后端再想试 GB18030
 * 已经没有原始字节可试——而那条路径**不报错**，只是把中文写成乱码。
 */
async function readFileBytes(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function submit(form: FormData, dryRun: boolean): Promise<ImportActionResult> {
  await requireSitePassword();

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    // 就地说清楚，不打后端：没有文件时后端也只能回一句同样的话。
    return { ok: false, message: "请先选择一个 grades.csv 文件。" };
  }
  const courseId = form.get("courseId");
  if (typeof courseId !== "string" || !courseId) {
    // 课程恒为当前选中的那一门。走到这里说明表单坏了，不是用户选错了。
    return { ok: false, message: "没能确定要导入到哪门课，请刷新页面重试。" };
  }

  let result: ImportResult;
  try {
    result = await importHomework({
      contentBase64: await readFileBytes(file),
      filename: file.name,
      courseId,
      dryRun,
    });
  } catch (error) {
    return classify(error);
  }

  if (!dryRun) {
    // 粒度是 layout 不是默认的 page：侧边栏那个计数由 (app)/layout.tsx 渲染，
    // page 粒度会让名单刷新而侧边栏的数字不动——不报错，只是一个永远不变的数，
    // 看着与"忘了 revalidate"一模一样。
    revalidatePath("/homework", "layout");
  }
  return { ok: true, result };
}

/** 算完整个处置结果但**一条都不写**。 */
export async function previewImport(form: FormData): Promise<ImportActionResult> {
  return submit(form, true);
}

/** 真的写入。用户看过预览并显式确认之后才走到这里。 */
export async function applyImport(form: FormData): Promise<ImportActionResult> {
  return submit(form, false);
}

/**
 * 把一个邮箱永久加入排除名单。
 *
 * 这里**不**返回新的预览——调用方标记完要重新请求一次预览，
 * 由后端整屏重算。前端自己把数字减一会得出一个后端并不认同的数，
 * 而不一致只在写入之后才暴露。
 */
export async function excludeEmailAction(email: string): Promise<SimpleActionResult> {
  await requireSitePassword();
  try {
    await addExcludedEmail(email);
  } catch (error) {
    return classify(error);
  }
  return { ok: true };
}
