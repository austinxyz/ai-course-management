// @vitest-environment node
//
// No DOM needed here — this only exercises fetch + data mapping.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sampleStudent = {
  email: "chen.jiahe@example.com",
  name: "陈嘉禾",
  wechat: "wx_chenjh",
  wx_name: "Jiahe Chen",
  nick: "嘉禾 🌱",
  region: "美西",
  tz: "UTC-8",
  level: "有基础",
  source: "讲武堂",
  tags: ["活跃"],
  note: "第 2 期老学员，主动帮同学答疑。",
  gender: "女",
  age: "30-35",
  industry: "互联网 · 运营",
};

describe("getStudents", () => {
  const originalBackendUrl = process.env.BACKEND_URL;

  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend.internal:8000";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([sampleStudent]),
      }),
    );
  });

  afterEach(() => {
    process.env.BACKEND_URL = originalBackendUrl;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("fetches from BACKEND_URL + /api/students and maps the response to Student[]", async () => {
    const { getStudents } = await import("./api");

    const students = await getStudents();

    expect(fetch).toHaveBeenCalledWith(
      "http://backend.internal:8000/api/students",
      expect.any(Object),
    );
    // api.ts maps the backend's snake_case wx_name to the frontend Student
    // type's camelCase wxName (see app/students/types.ts) — everything else
    // passes through unchanged.
    const { wx_name, ...rest } = sampleStudent;
    expect(students).toEqual([{ ...rest, wxName: wx_name }]);
  });

  it("presents the shared secret so the backend accepts the call", async () => {
    // The backend rejects anything without this header — it is what separates
    // our own server-side fetch from anyone else who knows the Render URL.
    process.env.BACKEND_SECRET = "test-secret-not-a-real-one";
    const { getStudents } = await import("./api");

    await getStudents();

    const init = vi.mocked(fetch).mock.calls[0][1];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Backend-Secret")).toBe("test-secret-not-a-real-one");
  });

  it("passes an abort signal so a hung backend cannot outlive the serverless function", async () => {
    // Without a timeout, a cold-starting Render backend keeps the fetch open
    // until Vercel kills the whole function — error.tsx never renders and the
    // user gets a platform 504 instead of our error card (design decision #2).
    const { getStudents } = await import("./api");

    await getStudents();

    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("write requests", () => {
  const originalBackendUrl = process.env.BACKEND_URL;
  const originalSecret = process.env.BACKEND_SECRET;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend.internal:8000";
    process.env.BACKEND_SECRET = "test-secret-not-a-real-one";
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleStudent),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env.BACKEND_URL = originalBackendUrl;
    process.env.BACKEND_SECRET = originalSecret;
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function headersOf(call: number): Record<string, string> {
    return fetchMock.mock.calls[call][1].headers as Record<string, string>;
  }

  it("carries the backend secret on every write, not only on reads", async () => {
    // The backend answers 401 without this header. A read path that has it and
    // a write path that doesn't would look fine on the roster page and fail
    // only when someone tries to save.
    const { updateStudent, createStudent, archiveStudent, restoreStudent } =
      await import("./api");

    await updateStudent("chen.jiahe@example.com", { note: "改了" });
    await createStudent({ email: "new@example.com", name: "新学员" });
    await archiveStudent("chen.jiahe@example.com");
    await restoreStudent("chen.jiahe@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (let call = 0; call < 4; call++) {
      expect(headersOf(call)["X-Backend-Secret"]).toBe(
        "test-secret-not-a-real-one",
      );
    }
  });

  it("sends only the fields the caller supplied", async () => {
    const { updateStudent } = await import("./api");

    await updateStudent("chen.jiahe@example.com", { note: "" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      note: "",
    });
  });

  it("renames wxName to the backend's wx_name when creating", async () => {
    // Sending wxName instead would be dropped by the backend without an error,
    // which looks exactly like never having sent it.
    const { createStudent } = await import("./api");

    await createStudent({
      email: "new@example.com",
      name: "新同学",
      wechat: "wx_new",
      wxName: "New Student",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ wechat: "wx_new", wx_name: "New Student" });
    expect(body).not.toHaveProperty("wxName");
  });

  it("surfaces the backend's status and detail on failure", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: () => Promise.resolve({ detail: "email belongs to an archived student" }),
    });
    const { createStudent, BackendError } = await import("./api");

    await expect(
      createStudent({ email: "taken@example.com", name: "新学员" }),
    ).rejects.toMatchObject({
      status: 409,
      detail: "email belongs to an archived student",
    });
    await expect(
      createStudent({ email: "taken@example.com", name: "新学员" }),
    ).rejects.toBeInstanceOf(BackendError);
  });

  /**
   * 204 No Content 没有 body。无条件 `res.json()` 会在解析空 body 时抛异常——
   * 于是一次**成功**的删除被上层当成失败：界面报"没删掉"、`revalidatePath` 不执行、
   * 那一行留在屏幕上，而记录其实已经没了。
   *
   * 症状与"真的删不掉"一模一样，只有刷新页面才看得出区别。
   */
  it("treats a 204 as success rather than choking on the empty body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    });
    const { deleteEnrollment } = await import("./api");

    await expect(deleteEnrollment("e-1")).resolves.toBeUndefined();
  });

});

describe("a 422 from the backend", () => {
  const originalBackendUrl = process.env.BACKEND_URL;

  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend.internal:8000";
  });

  afterEach(() => {
    process.env.BACKEND_URL = originalBackendUrl;
    vi.unstubAllGlobals();
  });

  it("turns Pydantic's error list into a readable string", async () => {
    // FastAPI 的 422 里 detail 是一个数组，元素形如
    // {type, loc, msg, input, ctx}。把它当字符串一路传下去，最终会被塞进 JSX ——
    // React 抛 "Objects are not valid as a React child"，用户看到的是整页崩溃，
    // 而不是"这个日期格式不对"。
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: async () => ({
          detail: [
            {
              type: "date_from_datetime_parsing",
              loc: ["body", "local_date"],
              msg: "Input should be a valid date or datetime, invalid character in year",
              input: "2026/6/14",
              ctx: { error: "invalid character in year" },
            },
          ],
        }),
      }),
    );

    const { addSession, BackendError } = await import("@/lib/api");

    const failure = await addSession("c-1", { local_date: "2026/6/14" }).catch((e) => e);

    expect(failure).toBeInstanceOf(BackendError);
    expect(typeof failure.detail).toBe("string");
    expect(failure.detail).toContain("local_date");
    expect(failure.detail).toContain("valid date");
  });

  it("still passes a plain string detail through untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: async () => ({ detail: "别名 S1 已属于课程「S1」" }),
      }),
    );

    const { addAlias } = await import("@/lib/api");

    const failure = await addAlias("c-1", "S1").catch((e) => e);

    expect(failure.detail).toBe("别名 S1 已属于课程「S1」");
  });

});

describe("导入相关的字段映射", () => {
  const originalBackendUrl = process.env.BACKEND_URL;

  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend.internal:8000";
  });

  afterEach(() => {
    process.env.BACKEND_URL = originalBackendUrl;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function respondWith(body: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) }),
    );
  }

  it("importHomework 把后端的 snake_case 收成前端的 camelCase", async () => {
    // 这一层漏掉一个字段不会报错：`undefined` 渲染出来就是空白，
    // 于是"跳过了 3 个人"在界面上长得跟"一个都没跳过"一模一样。
    respondWith({
      encoding: "gb18030",
      row_count: 17,
      created: 16,
      updated: 0,
      auto_created: ["ghost@example.com"],
      skipped_no_enrollment: ["nocourse@example.com"],
      superseded: ["session1/grades.csv:5"],
      rows_without_email: ["session1/grades.csv:9"],
      excluded: ["teacher@example.com"],
      header_warning: { file_items: ["E1"], existing_items: ["A1"] },
    });
    const { importHomework } = await import("./api");

    const result = await importHomework({
      contentBase64: "AAAA",
      filename: "grades.csv",
      courseId: "c-1",
      dryRun: true,
    });

    expect(result).toEqual({
      encoding: "gb18030",
      rowCount: 17,
      created: 16,
      updated: 0,
      autoCreated: ["ghost@example.com"],
      skippedNoEnrollment: ["nocourse@example.com"],
      superseded: ["session1/grades.csv:5"],
      rowsWithoutEmail: ["session1/grades.csv:9"],
      excluded: ["teacher@example.com"],
      headerWarning: { fileItems: ["E1"], existingItems: ["A1"] },
    });
  });

  it("dry_run 走查询参数，且真跑与预览分得开", async () => {
    respondWith({
      encoding: "utf-8",
      row_count: 0,
      created: 0,
      updated: 0,
      auto_created: [],
      skipped_no_enrollment: [],
      superseded: [],
      rows_without_email: [],
      excluded: [],
      header_warning: null,
    });
    const { importHomework } = await import("./api");

    await importHomework({ contentBase64: "AAAA", filename: "g.csv", courseId: "c-1", dryRun: false });

    expect(fetch).toHaveBeenCalledWith(
      "http://backend.internal:8000/api/homework/import?dry_run=false",
      expect.any(Object),
    );
  });

  it("没有表头警告时是 null，不是一个空壳对象", async () => {
    // `{fileItems: [], existingItems: []}` 是真值，界面会照样把警告渲染出来。
    respondWith({
      encoding: "utf-8",
      row_count: 1,
      created: 1,
      updated: 0,
      auto_created: [],
      skipped_no_enrollment: [],
      superseded: [],
      rows_without_email: [],
      excluded: [],
      header_warning: null,
    });
    const { importHomework } = await import("./api");

    const result = await importHomework({
      contentBase64: "AAAA",
      filename: "g.csv",
      courseId: "c-1",
      dryRun: true,
    });

    expect(result.headerWarning).toBeNull();
  });

  it("getLastImport 映射字段，并把「还没导过」保持成 null", async () => {
    respondWith({
      filename: "session1/grades.csv",
      encoding: "utf-8",
      row_count: 17,
      created_count: 16,
      updated_count: 1,
      imported_at: "2026-07-31T10:00:00Z",
    });
    const { getLastImport } = await import("./api");

    const found = await getLastImport("c-1");

    expect(found).toEqual({
      filename: "session1/grades.csv",
      encoding: "utf-8",
      rowCount: 17,
      createdCount: 16,
      updatedCount: 1,
      importedAt: "2026-07-31T10:00:00Z",
    });
  });

  it("getLastImport 在这门课还没导过时返回 null", async () => {
    // 「还没有」是正常状态，不是错误——不能在这里变成一个字段全 undefined 的对象。
    respondWith(null);
    const { getLastImport } = await import("./api");

    expect(await getLastImport("c-1")).toBeNull();
  });
});
