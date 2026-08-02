// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PASSWORD = "test-password-not-a-real-one";

const headersMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: headersMock }));

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const api = vi.hoisted(() => ({
  importHomework: vi.fn(),
  addExcludedEmail: vi.fn(),
  markHomeworkReplied: vi.fn(),
  markHomeworkUnreplied: vi.fn(),
}));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...api, BackendError: actual.BackendError };
});

function withAuthorization(value: string | null) {
  headersMock.mockResolvedValue(new Headers(value ? { Authorization: value } : {}));
}

function basic(password: string): string {
  return `Basic ${btoa(`anyone:${password}`)}`;
}

/** 一份**真正的 GB18030 字节序列**，不是 str 往返。 */
const GB18030_BYTES: Uint8Array<ArrayBuffer> = new Uint8Array([
  0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xd3, 0xca, 0xbc, 0xfe, 0x0a,
]);

function fileOf(bytes: Uint8Array<ArrayBuffer>, name = "grades.csv"): File {
  return new File([bytes], name, { type: "text/csv" });
}

function formOf(bytes: Uint8Array<ArrayBuffer>, courseId = "course-1"): FormData {
  const form = new FormData();
  form.set("file", fileOf(bytes));
  form.set("courseId", courseId);
  return form;
}

const OK_RESULT = {
  encoding: "utf-8",
  rowCount: 1,
  created: 1,
  updated: 0,
  autoCreated: [],
  skippedNoEnrollment: [],
  superseded: [],
  rowsWithoutEmail: [],
  excluded: [],
  headerWarning: null,
};

describe("homework import actions", () => {
  const original = process.env.SITE_PASSWORD;

  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD;
    vi.clearAllMocks();
    // clearAllMocks 清调用记录但**不清实现**。不在每个用例里重新给一遍返回值的话，
    // 单独跑与全量跑会得到不同结果，而差异出现在与本用例无关的断言上。
    api.importHomework.mockResolvedValue(OK_RESULT);
    api.addExcludedEmail.mockResolvedValue(undefined);
    api.markHomeworkReplied.mockResolvedValue({ replied: true, repliedAt: "2026-08-02T14:20:00Z" });
    api.markHomeworkUnreplied.mockResolvedValue({ replied: false, repliedAt: null });
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SITE_PASSWORD;
    else process.env.SITE_PASSWORD = original;
  });

  describe("鉴权", () => {
    it("未带站点密码时被拒绝，且不发出任何后端请求", async () => {
      // Server Function 编译成页面路由上的一个 POST 端点。谁能发那个 POST 就能
      // 到这里，不管他有没有真的加载过页面——所以 action 必须自己查，
      // 不能指望 proxy.ts 覆盖页面加载。
      const { previewImport } = await import("./actions");
      withAuthorization(null);

      await expect(previewImport(formOf(GB18030_BYTES))).rejects.toThrow();
      expect(api.importHomework).not.toHaveBeenCalled();
    });

    it("密码错误时同样被拒绝", async () => {
      const { previewImport } = await import("./actions");
      withAuthorization(basic("wrong"));

      await expect(previewImport(formOf(GB18030_BYTES))).rejects.toThrow();
      expect(api.importHomework).not.toHaveBeenCalled();
    });

    it("写入与标记排除这两个入口也各自要查", async () => {
      const actions = await import("./actions");
      withAuthorization(null);

      await expect(actions.applyImport(formOf(GB18030_BYTES))).rejects.toThrow();
      await expect(
        actions.excludeEmailAction("alpha@example.com"),
      ).rejects.toThrow();
      expect(api.importHomework).not.toHaveBeenCalled();
      expect(api.addExcludedEmail).not.toHaveBeenCalled();
    });

    it("标记已回复/未回复这两个入口也各自要查", async () => {
      const actions = await import("./actions");
      withAuthorization(null);

      await expect(actions.markReplied("sub-1")).rejects.toThrow();
      await expect(actions.markUnreplied("sub-1")).rejects.toThrow();
      expect(api.markHomeworkReplied).not.toHaveBeenCalled();
      expect(api.markHomeworkUnreplied).not.toHaveBeenCalled();
    });
  });

  describe("送出去的是字节", () => {
    it("body 里是 base64 的原始字节，逐字节与原文件相同", async () => {
      // 这是整个编码判定成立的前提。一旦在这一侧 file.text() 读成字符串，
      // 浏览器已经按 UTF-8 解过一遍，GBK 文件到后端已经是替换字符，
      // 后端再想试 GB18030 已经没有字节可试——而那条路径**不报错**，
      // 只是把中文变成乱码写进库。
      const { previewImport } = await import("./actions");
      withAuthorization(basic(PASSWORD));

      await previewImport(formOf(GB18030_BYTES));

      expect(api.importHomework).toHaveBeenCalledTimes(1);
      const sent = api.importHomework.mock.calls[0][0] as { contentBase64: string };
      const roundTripped = Uint8Array.from(
        Buffer.from(sent.contentBase64, "base64"),
      );
      expect(Array.from(roundTripped)).toEqual(Array.from(GB18030_BYTES));
    });

    it("带上文件名与当前课程，且 dry-run 与真跑分得开", async () => {
      const { applyImport, previewImport } = await import("./actions");
      withAuthorization(basic(PASSWORD));

      await previewImport(formOf(GB18030_BYTES, "course-9"));
      await applyImport(formOf(GB18030_BYTES, "course-9"));

      const [preview] = api.importHomework.mock.calls[0];
      const [real] = api.importHomework.mock.calls[1];
      expect(preview).toMatchObject({ courseId: "course-9", filename: "grades.csv", dryRun: true });
      expect(real).toMatchObject({ courseId: "course-9", dryRun: false });
    });
  });

  describe("预期内的失败用返回值表达", () => {
    it("后端 4xx 时返回 { ok: false, message }，不抛异常", async () => {
      // 抛出的 Server Action 错误在生产构建里只剩一个 digest，客户端拿不到内容。
      // "编码不对""表头不符""课程不存在""超限"全是用户正常操作能撞到的，
      // 它们必须能把话带到界面上。
      const { BackendError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
      const { previewImport } = await import("./actions");
      withAuthorization(basic(PASSWORD));
      api.importHomework.mockRejectedValue(
        new BackendError(422, "这看起来不是作业成绩文件：缺少「提交时间」这几列。"),
      );

      const result = await previewImport(formOf(GB18030_BYTES));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("不是作业成绩文件");
      }
    });

    it("成功时把后端的判断原样带回去", async () => {
      const { previewImport } = await import("./actions");
      withAuthorization(basic(PASSWORD));

      const result = await previewImport(formOf(GB18030_BYTES));

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.result).toEqual(OK_RESULT);
    });

    it("没有选文件时就地说清楚，不打后端", async () => {
      const { previewImport } = await import("./actions");
      withAuthorization(basic(PASSWORD));
      const empty = new FormData();
      empty.set("courseId", "course-1");

      const result = await previewImport(empty);

      expect(result.ok).toBe(false);
      expect(api.importHomework).not.toHaveBeenCalled();
    });

    it("表单里没有课程时也不打后端", async () => {
      // 走到这里说明表单坏了，不是用户选错了——界面上根本没有课程选择控件，
      // 课程恒为当前选中的那一门。
      const { previewImport } = await import("./actions");
      withAuthorization(basic(PASSWORD));
      const form = new FormData();
      form.set("file", fileOf(GB18030_BYTES));

      const result = await previewImport(form);

      expect(result.ok).toBe(false);
      expect(api.importHomework).not.toHaveBeenCalled();
    });
  });

  describe("标记排除", () => {
    it("成功时转发那个邮箱并回 ok", async () => {
      const { excludeEmailAction } = await import("./actions");
      withAuthorization(basic(PASSWORD));

      const result = await excludeEmailAction("alpha@example.com");

      expect(api.addExcludedEmail).toHaveBeenCalledWith("alpha@example.com");
      expect(result.ok).toBe(true);
    });

    it("后端拒绝时同样用返回值表达，不抛", async () => {
      const { BackendError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
      const { excludeEmailAction } = await import("./actions");
      withAuthorization(basic(PASSWORD));
      api.addExcludedEmail.mockRejectedValue(new BackendError(422, "邮箱不能为空"));

      const result = await excludeEmailAction("");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("邮箱");
    });

    it("**不**自己重算预览——重算要由调用方重新请求一次", async () => {
      // 前端自己把数字减一会得出一个后端并不认同的数，
      // 而不一致只在写入之后才暴露。
      const { excludeEmailAction } = await import("./actions");
      withAuthorization(basic(PASSWORD));

      await excludeEmailAction("alpha@example.com");

      expect(api.importHomework).not.toHaveBeenCalled();
    });
  });

  describe("写入之后让页面跟着变", () => {
    it("真跑成功后 revalidatePath('/homework', 'layout')", async () => {
      // 粒度是 layout 不是默认的 page：侧边栏那个数字由 (app)/layout.tsx 渲染，
      // page 粒度会让表格刷新而数字不动——不报错，只是一个永远不变的数。
      const { applyImport } = await import("./actions");
      withAuthorization(basic(PASSWORD));

      await applyImport(formOf(GB18030_BYTES));

      expect(cache.revalidatePath).toHaveBeenCalledWith("/homework", "layout");
    });

    it("预览**不**触发 revalidate —— 它什么都没改", async () => {
      const { previewImport } = await import("./actions");
      withAuthorization(basic(PASSWORD));

      await previewImport(formOf(GB18030_BYTES));

      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("写入失败时不 revalidate —— 没有任何东西变了", async () => {
      const { BackendError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
      const { applyImport } = await import("./actions");
      withAuthorization(basic(PASSWORD));
      api.importHomework.mockRejectedValue(new BackendError(422, "表头不对"));

      await applyImport(formOf(GB18030_BYTES));

      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("标记已回复", () => {
    it("成功时转发提交 id、带回最新状态、并 revalidate", async () => {
      const { markReplied } = await import("./actions");
      withAuthorization(basic(PASSWORD));

      const result = await markReplied("sub-1");

      expect(api.markHomeworkReplied).toHaveBeenCalledWith("sub-1");
      expect(result).toEqual({ ok: true, replied: true, repliedAt: "2026-08-02T14:20:00Z" });
      expect(cache.revalidatePath).toHaveBeenCalledWith("/homework", "layout");
    });

    it("标记未回复同样转发、带回状态、并 revalidate", async () => {
      const { markUnreplied } = await import("./actions");
      withAuthorization(basic(PASSWORD));

      const result = await markUnreplied("sub-1");

      expect(api.markHomeworkUnreplied).toHaveBeenCalledWith("sub-1");
      expect(result).toEqual({ ok: true, replied: false, repliedAt: null });
      expect(cache.revalidatePath).toHaveBeenCalledWith("/homework", "layout");
    });

    it("后端拒绝时用返回值表达，不抛，也不 revalidate", async () => {
      const { BackendError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
      const { markReplied } = await import("./actions");
      withAuthorization(basic(PASSWORD));
      api.markHomeworkReplied.mockRejectedValue(new BackendError(404, "没有这条提交记录"));

      const result = await markReplied("missing-id");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("没有这条提交记录");
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });
  });
});
