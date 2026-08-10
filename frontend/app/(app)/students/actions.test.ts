// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PASSWORD = "test-password-not-a-real-one";

const headersMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const api = vi.hoisted(() => ({
  updateStudent: vi.fn(),
  createStudent: vi.fn(),
  archiveStudent: vi.fn(),
  restoreStudent: vi.fn(),
  createManualInteraction: vi.fn(),
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

describe("student write actions", () => {
  const original = process.env.SITE_PASSWORD;

  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SITE_PASSWORD;
    else process.env.SITE_PASSWORD = original;
  });

  it("refuses an unauthenticated call without touching the backend", async () => {
    // A Server Function is a POST endpoint on the page route. Anyone who can
    // send that POST reaches it, whether or not they ever loaded the page —
    // so the action has to check for itself rather than trust the proxy.
    const { updateStudentField } = await import("./actions");
    withAuthorization(null);

    await expect(
      updateStudentField("someone@example.com", { note: "写入" }),
    ).rejects.toThrow();
    expect(api.updateStudent).not.toHaveBeenCalled();
  });

  it("refuses a wrong password without touching the backend", async () => {
    const { updateStudentField } = await import("./actions");
    withAuthorization(basic("wrong"));

    await expect(
      updateStudentField("someone@example.com", { note: "写入" }),
    ).rejects.toThrow();
    expect(api.updateStudent).not.toHaveBeenCalled();
  });

  it("guards every write entry point, not only the field update", async () => {
    const actions = await import("./actions");
    withAuthorization(null);

    await expect(
      actions.createStudentAction({ email: "x@example.com", name: "新学员" }),
    ).rejects.toThrow();
    await expect(
      actions.archiveStudentAction("someone@example.com"),
    ).rejects.toThrow();
    await expect(
      actions.restoreStudentAction("someone@example.com"),
    ).rejects.toThrow();

    expect(api.createStudent).not.toHaveBeenCalled();
    expect(api.archiveStudent).not.toHaveBeenCalled();
    expect(api.restoreStudent).not.toHaveBeenCalled();
  });

  it("lets a correctly authenticated write through to the backend", async () => {
    // The opposite failure of the tests above, and the one they cannot catch:
    // a guard that rejects unconditionally passes every "must be denied"
    // assertion while breaking every write in the product.
    const { updateStudentField } = await import("./actions");
    withAuthorization(basic(PASSWORD));

    await updateStudentField("someone@example.com", { note: "写入" });

    expect(api.updateStudent).toHaveBeenCalledWith("someone@example.com", {
      note: "写入",
    });
  });

  it("lets create, archive and restore through as well", async () => {
    const actions = await import("./actions");
    withAuthorization(basic(PASSWORD));
    // Set the happy path explicitly: `vi.clearAllMocks()` clears call records
    // but keeps implementations, so a rejection set by an earlier test would
    // otherwise still be in force here and silently skip one revalidate.
    api.createStudent.mockResolvedValue(undefined);

    await actions.createStudentAction({ email: "x@example.com", name: "新学员" });
    await actions.archiveStudentAction("someone@example.com");
    await actions.restoreStudentAction("someone@example.com");

    expect(api.createStudent).toHaveBeenCalledOnce();
    expect(api.archiveStudent).toHaveBeenCalledWith("someone@example.com");
    expect(api.restoreStudent).toHaveBeenCalledWith("someone@example.com");
  });
});

describe("create refusals are returned, not thrown", () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD;
    vi.clearAllMocks();
    withAuthorization(basic(PASSWORD));
  });

  it("reports an archived collision as a value the client can read", async () => {
    // Production builds redact thrown Server Action errors down to a digest.
    // Anything the UI needs in order to tell the two collisions apart has to
    // travel as a return value, or it survives locally and vanishes once
    // deployed — a difference that only shows up where it costs the most.
    const { createStudentAction } = await import("./actions");
    const { BackendError } = await import("@/lib/api");
    api.createStudent.mockRejectedValue(
      new BackendError(409, "email belongs to an archived student"),
    );

    await expect(
      createStudentAction({ email: "x@example.com", name: "新学员" }),
    ).resolves.toEqual({
      ok: false,
      kind: "archived",
      message: "email belongs to an archived student",
    });
  });

  it("distinguishes a plain duplicate from an archived one", async () => {
    const { createStudentAction } = await import("./actions");
    const { BackendError } = await import("@/lib/api");
    api.createStudent.mockRejectedValue(new BackendError(409, "email already exists"));

    await expect(
      createStudentAction({ email: "x@example.com", name: "新学员" }),
    ).resolves.toMatchObject({ ok: false, kind: "exists" });
  });

  it("still refuses an unauthenticated caller by throwing", async () => {
    // Not an expected outcome of the form — nobody using the app can reach it,
    // so it must not be reported as a tidy result the UI might render.
    const { createStudentAction } = await import("./actions");
    withAuthorization(null);

    await expect(
      createStudentAction({ email: "x@example.com", name: "新学员" }),
    ).rejects.toThrow();
    expect(api.createStudent).not.toHaveBeenCalled();
  });

  /**
   * The badge count now lives in the shell layout, not in the students page.
   *
   * `revalidatePath(path)` defaults to page granularity, which leaves layouts
   * untouched — the roster would update while the sidebar kept showing the old
   * number. Nothing errors; the digit simply never moves, which looks exactly
   * like having forgotten to revalidate at all.
   */
  it("revalidates at layout granularity so the shell badge updates too", async () => {
    const { revalidatePath } = await import("next/cache");
    const actions = await import("./actions");
    withAuthorization(basic(PASSWORD));
    // Set the happy path explicitly: `vi.clearAllMocks()` clears call records
    // but keeps implementations, so a rejection set by an earlier test would
    // otherwise still be in force here and silently skip one revalidate.
    api.createStudent.mockResolvedValue(undefined);

    await actions.createStudentAction({ email: "x@example.com", name: "新学员" });
    await actions.archiveStudentAction("someone@example.com");
    await actions.restoreStudentAction("someone@example.com");
    await actions.updateStudentField("someone@example.com", { note: "写入" });

    const calls = vi.mocked(revalidatePath).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([
      "/students",
      "/students",
      "/students",
      "/students",
    ]);
    for (const call of calls) {
      expect(call[1]).toBe("layout");
    }
  });
});

describe("createManualInteractionAction", () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD;
    vi.clearAllMocks();
    withAuthorization(basic(PASSWORD));
  });

  it("revalidates both /students (layout) and /interactions after a successful write", async () => {
    // 手动记录同时出现在三处消费方——详情面板（/students layout）、独立页
    // （/interactions）、侧边栏徽标（同一份 /students layout 调用覆盖）。
    // 只 revalidate 一处会让另一处显示旧数据（interactions-manual-entry
    // design.md 决定 5）。
    const { revalidatePath } = await import("next/cache");
    const { createManualInteractionAction } = await import("./actions");
    api.createManualInteraction.mockResolvedValue(undefined);

    await createManualInteractionAction({
      studentEmail: "alpha@example.com",
      courseId: "c1",
      channel: "wechat",
      note: "聊了下学习进度",
    });

    const calls = vi.mocked(revalidatePath).mock.calls;
    expect(calls).toContainEqual(["/students", "layout"]);
    expect(calls).toContainEqual(["/interactions"]);
  });

  it("returns a failure value instead of throwing on a backend error", async () => {
    const { createManualInteractionAction } = await import("./actions");
    const { BackendError } = await import("@/lib/api");
    api.createManualInteraction.mockRejectedValue(new BackendError(422, "内容不能为空"));

    await expect(
      createManualInteractionAction({
        studentEmail: "alpha@example.com",
        courseId: "c1",
        channel: "wechat",
        note: "",
      }),
    ).resolves.toEqual({ ok: false, message: "内容不能为空" });
  });

  it("refuses an unauthenticated call without touching the backend", async () => {
    const { createManualInteractionAction } = await import("./actions");
    withAuthorization(null);

    await expect(
      createManualInteractionAction({
        studentEmail: "alpha@example.com",
        courseId: "c1",
        channel: "wechat",
        note: "聊了下学习进度",
      }),
    ).rejects.toThrow();
    expect(api.createManualInteraction).not.toHaveBeenCalled();
  });
});
