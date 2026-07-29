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
}));
vi.mock("@/lib/api", () => api);

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

    await actions.createStudentAction({ email: "x@example.com", name: "新学员" });
    await actions.archiveStudentAction("someone@example.com");
    await actions.restoreStudentAction("someone@example.com");

    expect(api.createStudent).toHaveBeenCalledOnce();
    expect(api.archiveStudent).toHaveBeenCalledWith("someone@example.com");
    expect(api.restoreStudent).toHaveBeenCalledWith("someone@example.com");
  });
});
