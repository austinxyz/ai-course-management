// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getCourses: vi.fn(),
  getHomework: vi.fn(),
  getLastImport: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const COURSES = [
  { id: "c1", name: "从零开始用 Claude 和 Cowork", short: "S1", offline: false },
];
const PEOPLE = [{ studentEmail: "alpha@example.com", name: "学员甲" }];

async function renderPage(searchParams: { course?: string; student?: string } = {}) {
  const { default: HomeworkPage } = await import("./page");
  // Server Component 就是个 async 函数，直接调用、看它交给客户端组件的 props。
  return (await HomeworkPage({ searchParams: Promise.resolve(searchParams) })) as {
    props: Record<string, unknown>;
  };
}

describe("作业页取数", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks 不清实现——每个用例显式给自己依赖的返回值。
    api.getCourses.mockResolvedValue(COURSES);
    api.getHomework.mockResolvedValue(PEOPLE);
    api.getLastImport.mockResolvedValue({
      filename: "session1/grades.csv",
      encoding: "utf-8",
      rowCount: 17,
      createdCount: 16,
      updatedCount: 1,
      importedAt: "2026-07-31T22:47:00Z",
    });
  });

  it("正常时把上次导入一并交下去", async () => {
    const element = await renderPage();

    expect(element.props.lastImport).toMatchObject({ rowCount: 17 });
    expect(element.props.people).toEqual(PEOPLE);
  });

  it("上次导入取不到时，**整页仍然出得来**", async () => {
    // 「上次导入 …」是一行说明性的字。它挂了就把整个作业名单一起带走的话，
    // 用户看到的是一屏错误卡片——而他真正要的那份名单其实取到了。
    // 这一条与"后端整个挂了"要分得开：那种情况该由 error.tsx 接。
    api.getLastImport.mockRejectedValue(new Error("last-import 500"));

    const element = await renderPage();

    expect(element.props.lastImport).toBeNull();
    expect(element.props.people).toEqual(PEOPLE);
  });

  it("名单本身取不到时照常抛出去，交给 error.tsx", async () => {
    // 这条不能被上面那个兜底顺手吞掉：名单是这一页存在的理由，
    // 它挂了还渲染一个空页面，看起来就是"这门课没有人"——一个假事实。
    api.getHomework.mockRejectedValue(new Error("homework 500"));

    await expect(renderPage()).rejects.toThrow(/homework 500/);
  });
});

describe("深链接自动选中学员", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCourses.mockResolvedValue(COURSES);
    api.getHomework.mockResolvedValue(PEOPLE);
    api.getLastImport.mockResolvedValue(null);
  });

  it("searchParams 带 student 时，透传给 HomeworkClient 的 initialSelectedEmail", async () => {
    const element = await renderPage({ course: "c1", student: "alpha@example.com" });

    expect(element.props.initialSelectedEmail).toBe("alpha@example.com");
  });

  it("searchParams 不带 student 时，initialSelectedEmail 是 null", async () => {
    const element = await renderPage({ course: "c1" });

    expect(element.props.initialSelectedEmail).toBeNull();
  });
});
