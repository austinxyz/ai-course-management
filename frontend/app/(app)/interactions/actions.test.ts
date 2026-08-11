// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PASSWORD = "test-password-not-a-real-one";

const headersMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const api = vi.hoisted(() => ({
  createInteraction: vi.fn(),
  deleteInteraction: vi.fn(),
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

describe("createInteractionAction", () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD;
    vi.clearAllMocks();
    withAuthorization(basic(PASSWORD));
  });

  afterEach(() => {
    delete process.env.SITE_PASSWORD;
  });

  it("revalidates both /interactions (layout) and /students (layout) after a successful write", async () => {
    const { revalidatePath } = await import("next/cache");
    const { createInteractionAction } = await import("./actions");
    api.createInteraction.mockResolvedValue(undefined);

    await createInteractionAction({
      kind: "manual",
      studentEmail: "alpha@example.com",
      type: "1on1",
      note: "聊了下学习进度",
    });

    const calls = vi.mocked(revalidatePath).mock.calls;
    expect(calls).toContainEqual(["/interactions", "layout"]);
    expect(calls).toContainEqual(["/students", "layout"]);
  });

  it("works for a participation signal write too", async () => {
    const { createInteractionAction } = await import("./actions");
    api.createInteraction.mockResolvedValue(undefined);

    const result = await createInteractionAction({
      kind: "participation",
      studentEmail: "alpha@example.com",
      signal: "live",
    });

    expect(result).toEqual({ ok: true });
    expect(api.createInteraction).toHaveBeenCalledWith({
      kind: "participation",
      studentEmail: "alpha@example.com",
      signal: "live",
    });
  });

  it("returns a failure value instead of throwing on a backend error", async () => {
    const { createInteractionAction } = await import("./actions");
    const { BackendError } = await import("@/lib/api");
    api.createInteraction.mockRejectedValue(new BackendError(422, "内容不能为空"));

    await expect(
      createInteractionAction({ kind: "manual", studentEmail: "alpha@example.com", type: "1on1", note: "" }),
    ).resolves.toEqual({ ok: false, message: "内容不能为空" });
  });

  it("refuses an unauthenticated call without touching the backend", async () => {
    const { createInteractionAction } = await import("./actions");
    withAuthorization(null);

    await expect(
      createInteractionAction({
        kind: "manual",
        studentEmail: "alpha@example.com",
        type: "1on1",
        note: "内容",
      }),
    ).rejects.toThrow();
    expect(api.createInteraction).not.toHaveBeenCalled();
  });
});

describe("deleteInteractionAction", () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD;
    vi.clearAllMocks();
    withAuthorization(basic(PASSWORD));
  });

  afterEach(() => {
    delete process.env.SITE_PASSWORD;
  });

  it("revalidates both /interactions (layout) and /students (layout) after a successful delete", async () => {
    const { revalidatePath } = await import("next/cache");
    const { deleteInteractionAction } = await import("./actions");
    api.deleteInteraction.mockResolvedValue(undefined);

    await deleteInteractionAction("i1");

    expect(api.deleteInteraction).toHaveBeenCalledWith("i1");
    const calls = vi.mocked(revalidatePath).mock.calls;
    expect(calls).toContainEqual(["/interactions", "layout"]);
    expect(calls).toContainEqual(["/students", "layout"]);
  });

  it("returns a failure value instead of throwing on a backend error", async () => {
    const { deleteInteractionAction } = await import("./actions");
    const { BackendError } = await import("@/lib/api");
    api.deleteInteraction.mockRejectedValue(new BackendError(422, "这类记录不能删除"));

    await expect(deleteInteractionAction("i1")).resolves.toEqual({
      ok: false,
      message: "这类记录不能删除",
    });
  });

  it("refuses an unauthenticated call without touching the backend", async () => {
    const { deleteInteractionAction } = await import("./actions");
    withAuthorization(null);

    await expect(deleteInteractionAction("i1")).rejects.toThrow();
    expect(api.deleteInteraction).not.toHaveBeenCalled();
  });
});
