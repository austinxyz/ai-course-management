import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * 生产验收 5.8：**真的写一次**。
 *
 * 与 `homework-import-acceptance.spec.ts` 分开成一支，且要额外一个
 * `ACCEPTANCE_WRITE=1` 才跑——只读那一支将来会被反复跑，这一支不该
 * 跟着一起动真实学员数据。两者混在一个文件里，早晚有一次是误跑。
 *
 *   ACCEPTANCE_WRITE=1 SITE_PASSWORD=... BASE_URL=... GRADES_DIR=... \
 *   npx playwright test e2e/homework-import-write.spec.ts
 *
 * 写的是**已经在库里的同一批成绩**：语义是"以这份文件为准"，所以正确的
 * 结果是数字一个都不变。这条测的就是这件事——幂等。
 */

const GRADES_DIR = process.env.GRADES_DIR ?? "";
const SHOT_DIR = process.env.SHOT_DIR ?? "test-results/prod-write";
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.BASE_URL ?? "");

const S1 = /从零开始用 Claude 和 Cowork/;

test.skip(!process.env.BASE_URL || isLocal, "opt-in: BASE_URL must point at the deployed site");
test.skip(process.env.ACCEPTANCE_WRITE !== "1", "opt-in: ACCEPTANCE_WRITE must be 1");
test.skip(!GRADES_DIR, "GRADES_DIR not set");

const dialog = (page: Page) => page.getByRole("dialog", { name: "导入 grades.csv" });

test("5.8 确认写入 S1：幂等，且出现「上次导入」", async ({ page }) => {
  await page.goto("/homework");
  await expect(page.getByRole("heading", { name: "作业" })).toBeVisible({ timeout: 90_000 });
  await page.locator('a[href^="/homework?course="]').filter({ hasText: S1 }).first().click();
  await page.waitForURL(/[?&]course=/);

  const submitted = page.getByRole("button", { name: /^已交/ });
  const before = await submitted.textContent();
  expect(before).toBe("已交 16");

  const input = page.locator('input[type="file"]');
  await expect(async () => {
    await input.setInputFiles([]);
    await input.setInputFiles(join(GRADES_DIR, "session1", "grades.csv"));
    await expect(dialog(page)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  const d = dialog(page);
  const confirm = d.getByRole("button", { name: /确认导入/ });
  await expect(confirm).toBeVisible({ timeout: 60_000 });

  // 按下去之前再核一遍：这一批全是更新，一条都不新建。
  // 如果这里变成了"新建"，说明挂错了课，**不该往下走**。
  await expect(d.getByTestId("count-created")).toHaveText("0");
  await expect(d.getByTestId("count-updated")).toHaveText("16");
  await expect(confirm).toHaveText("确认导入 16 条");

  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOT_DIR, "before-confirm.png"), fullPage: true });

  await confirm.click();
  // 只在成功回调里关闭——弹窗消失本身就是写入成功的信号。
  await expect(d).toBeHidden({ timeout: 90_000 });

  // 幂等：同一批成绩再写一遍，计数一个都不该动。
  await expect(submitted).toHaveText("已交 16");

  // 导入记录只在**实际写入**时产生。前面那些取消掉的预览没有留下记录，
  // 所以这一行现在才第一次出现（或被这次刷新）。
  const last = page.getByTestId("last-import");
  await expect(last).toBeVisible();
  await expect(last).toContainText("grades.csv");
  await expect(last).toContainText("17 行");
  await page.screenshot({ path: join(SHOT_DIR, "after-import.png"), fullPage: true });

  // 刷新一次再看：读回来的是库里的东西，不是屏幕上残留的状态。
  await page.reload();
  await expect(page.getByRole("button", { name: /^已交/ })).toHaveText("已交 16");
  await expect(page.getByTestId("last-import")).toContainText("grades.csv");
});
