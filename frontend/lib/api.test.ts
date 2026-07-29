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
});
