import { existsSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * 生产验收：`homework-upload` 的 5.6 / 5.7 / 5.9 / 5.10。
 *
 * **这一支只读。** 每条都在预览停下并取消，一条都不写——预览的整个意义
 * 就是"先看看会发生什么"，而这里跑的是真实学员数据。真正的写入（5.8）
 * 是另一次、要人先看过数字再点头的操作。
 *
 *   cd frontend
 *   SITE_PASSWORD='<生产密码>' \
 *   BASE_URL=https://ai-course-management.vercel.app \
 *   GRADES_DIR='<ai-course>/tools/homework-grader' \
 *   npx playwright test e2e/homework-import-acceptance.spec.ts
 *
 * 断言只碰**计数**与讲师本人的邮箱。真实学员的姓名邮箱不进断言、不进日志——
 * 它们会留在 CI 输出与终端里。
 */

const GRADES_DIR = process.env.GRADES_DIR ?? "";
const GBK_S2 = process.env.GBK_S2 ?? "";
const ROSTER_CSV = process.env.ROSTER_CSV ?? "";
// 讲师本人的邮箱由 migration 回填进排除名单。这是 5.6 唯一的生产判据：
// 本地空库重放时那条 insert 跑在 0 行上，不被任何本地测试覆盖。
const TEACHER = process.env.TEACHER_EMAIL ?? "austin.xyz@gmail.com";

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.BASE_URL ?? "");

test.skip(!process.env.BASE_URL || isLocal, "opt-in: BASE_URL must point at the deployed site");
test.skip(!GRADES_DIR, "GRADES_DIR not set");

/**
 * 课程要钉到**唯一**一门。
 *
 * 生产上有四门课，其中两门名字里都带 "Claude"（S1 与建知识库那门），
 * 一个宽松的 `/Claude/` 会同时命中，`.first()` 拿到的是哪一门取决于渲染
 * 顺序——而这一片的整个立论就是"选错课程会覆盖整门课的成绩"。
 * 第一次跑就撞上了：预览报「将新建 10 条」，说明文件挂到了别的课上。
 */
const S1 = /从零开始用 Claude 和 Cowork/;
const S2 = /先造枪/;

const dialog = (page: Page) => page.getByRole("dialog", { name: "导入 grades.csv" });

async function gotoCourse(page: Page, label: RegExp) {
  await page.goto("/homework");
  await expect(page.getByRole("heading", { name: "作业" })).toBeVisible({ timeout: 90_000 });
  // 按 href 选，不按 role 选。两个坑：不限定范围的话 `/Claude/` 会同时命中
  // 侧边栏的「Claude AI 课程」品牌行（strict mode 直接报两个元素）；
  // 而页头那个 `<header>` 嵌在 `<main>` 里，**拿不到 banner 角色**，
  // 用 `getByRole("banner")` 限定会一个都选不中。
  const chip = page.locator('a[href^="/homework?course="]').filter({ hasText: label });
  await expect(chip.first()).toBeVisible();
  await chip.first().click();
  // 等 URL 真的带上 course，否则页面还停在默认那门课上——
  // 这时读到的「已交 N」是**别的课**的数，拿它当基线，后面的
  // "预览不写"断言就会因为一个与写入毫无关系的原因失败。
  await page.waitForURL(/[?&]course=/);
  await expect(page.getByRole("heading", { name: "作业" })).toBeVisible();
}

async function pick(page: Page, absPath: string) {
  const input = page.locator('input[type="file"]');
  await expect(async () => {
    // 清空再选：同一个文件选两次不会再发 change，水合前那一次会把循环卡死。
    await input.setInputFiles([]);
    await input.setInputFiles(absPath);
    await expect(dialog(page)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
}

/** 看完就走。**不点确认。** */
async function cancel(page: Page) {
  await page.getByRole("button", { name: "取消" }).click();
  await expect(dialog(page)).toBeHidden();
}

test.describe("生产验收 · 只读", () => {
  test("5.7 + 5.6 预览 S1：全是更新，编码 UTF-8，讲师已被排除", async ({ page }) => {
    await gotoCourse(page, S1);
    const submittedBefore = await page.getByRole("button", { name: /^已交/ }).textContent();

    await pick(page, join(GRADES_DIR, "session1", "grades.csv"));
    const d = dialog(page);
    await expect(d.getByRole("button", { name: /确认导入/ })).toBeVisible({ timeout: 60_000 });

    await expect(d).toContainText("按 UTF-8 读取");
    // 这门课导过一次了，所以应该全是更新、一条都不新建。
    await expect(d.getByTestId("count-created")).toHaveText("0");
    // 5.6：回填确实生效了——讲师那一行显示为已排除，而不是待写入。
    await expect(d.getByTestId("excluded-list")).toContainText(TEACHER);

    const updated = await d.getByTestId("count-updated").textContent();
    const skipped = await d.getByTestId("count-skipped").textContent();
    console.log(`PREVIEW S1 updated=${updated} skipped=${skipped} (created=0)`);

    await cancel(page);
    // 预览不写：计数一动不动。
    await expect(page.getByRole("button", { name: /^已交/ })).toHaveText(submittedBefore ?? "");
  });

  test("5.9 预览 GBK 的 S2：注明按 GBK 读取", async ({ page }) => {
    test.skip(!GBK_S2 || !existsSync(GBK_S2), "GBK_S2 not provided");
    await gotoCourse(page, S2);

    await pick(page, GBK_S2);
    const d = dialog(page);
    await expect(d).toContainText("按 GBK 读取", { timeout: 60_000 });
    await expect(d).toContainText("请核对");
    // 中文没被解成另一批字。断言用的是**界面自己的**措辞，不是学员姓名。
    await expect(d).toContainText("解错编码不会报错");
    await cancel(page);
  });

  test("5.10a 传错文件被拒，且说得出这不像作业成绩文件", async ({ page }) => {
    test.skip(!ROSTER_CSV || !existsSync(ROSTER_CSV), "ROSTER_CSV not provided");
    await gotoCourse(page, S1);

    await pick(page, ROSTER_CSV);
    const d = dialog(page);
    await expect(d.getByRole("alert")).toContainText("不是作业成绩文件", { timeout: 60_000 });
    await expect(d.getByRole("button", { name: /确认导入/ })).toHaveCount(0);
    await cancel(page);
  });

  test("5.10b 把 S2 的文件传到 S1：表头警告列出两边，但不拒绝", async ({ page }) => {
    await gotoCourse(page, S1);

    await pick(page, join(GRADES_DIR, "session2", "grades.csv"));
    const d = dialog(page);
    const warning = d.getByTestId("header-warning");
    await expect(warning).toBeVisible({ timeout: 60_000 });
    // 两边都列出来了才叫"能判断是不是传错了课程"。
    await expect(warning).toContainText("E1");
    await expect(warning).toContainText("A1");
    // 警告不是拒绝。**但我们不确认。**
    await expect(d.getByRole("button", { name: /确认导入/ })).toBeEnabled();
    await cancel(page);
  });
});
