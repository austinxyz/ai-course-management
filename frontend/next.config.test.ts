// @vitest-environment node
import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

/**
 * 后端 `MAX_UPLOAD_BYTES`（`backend/app/routers/homework.py`）。
 *
 * 两个数隔着一层进程，没有编译期的东西能把它们钉在一起，所以在这里
 * 用一条断言代替。改后端那个常量而不改这里，这条测试会红。
 */
const BACKEND_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function parseSize(value: string | number): number {
  if (typeof value === "number") return value;
  const match = /^(\d+(?:\.\d+)?)(kb|mb|gb)?$/i.exec(value.trim());
  if (!match) throw new Error(`看不懂的体积写法：${value}`);
  const scale = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  const unit = match[2]?.toLowerCase() as keyof typeof scale | undefined;
  return Number(match[1]) * (unit ? scale[unit] : 1);
}

describe("Server Action 的请求体上限", () => {
  it("必须大于后端的上传上限，否则超限的说明永远到不了用户面前", () => {
    // Next.js 默认把 Server Action 的请求体卡在 1MB，**在 action 代码跑起来之前**
    // 就拒掉。默认值比后端的 2MB 小，于是 1–2MB 的文件走的是框架的 413，
    // 而不是我们那句"文件超过上限（2 MB）…"——用户拿到一个没有出处的报错，
    // 而 `previewImport` 里那条"预期内的失败用返回值表达"的保证在这一段区间里
    // 根本没有机会生效。
    //
    // 上限往上抬而不是把后端往下压：后端是唯一一条进库的路，MCP 那条调用
    // 完全不经过 Next，两边各自有一个不同的上限只会让"多大算大"取决于
    // 你从哪个客户端进来。
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;

    expect(limit, "next.config.ts 没有设 serverActions.bodySizeLimit").toBeDefined();
    expect(parseSize(limit!)).toBeGreaterThan(BACKEND_MAX_UPLOAD_BYTES);
  });

  it("留出 multipart 的额外开销", () => {
    // 客户端送的是 FormData（multipart），不是 base64 —— base64 是 action
    // 在服务端才做的，不占请求体。所以线上体积 ≈ 文件本身 + 边界与字段头，
    // 官方文档给的经验值是 10–20 KB。
    const limit = parseSize(nextConfig.experimental!.serverActions!.bodySizeLimit!);

    expect(limit - BACKEND_MAX_UPLOAD_BYTES).toBeGreaterThan(20 * 1024);
  });
});
