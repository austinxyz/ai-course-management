import { expect, test, type Page } from "@playwright/test";

/**
 * Production acceptance for the student-write change.
 *
 * Runs against a deployed environment, so it is opt-in: without an explicit
 * BASE_URL it skips rather than writing into whatever database happens to be
 * behind localhost.
 *
 *   cd frontend
 *   SITE_PASSWORD='<production password>' \
 *   BASE_URL=https://ai-course-management.vercel.app \
 *   npx playwright test e2e/production-acceptance.spec.ts
 *
 * Every step reloads before asserting. That is the entire point of this file:
 * the defect this change fixed was a UI that showed edits which had never been
 * written, and only a reload can tell the two apart.
 *
 * It creates exactly one obviously-fictional record and touches nothing else.
 * The record is left behind on purpose — hard delete is deliberately not a
 * feature of this system, so removing it is a manual step against the database:
 *
 *   DELETE FROM students WHERE email = 'deploy-test-2@example.com';
 *
 * Set ACCEPTANCE_EMAIL (and optionally ACCEPTANCE_NAME) to use a different one.
 */

/**
 * Which fictional record this run uses.
 *
 * Overridable because the walk-through creates its subject and this system has
 * no hard delete: re-running against the same environment needs either a fresh
 * address or a manual cleanup of the previous one. Keeping it a parameter beats
 * editing the file each time and beats accumulating records nobody meant to
 * keep.
 */
const TEST_EMAIL = process.env.ACCEPTANCE_EMAIL ?? "deploy-test-2@example.com";
const TEST_NAME = process.env.ACCEPTANCE_NAME ?? "部署测试记录二";
const WECHAT = "wx_deploy_test";
const WECHAT_EDITED = "wx_deploy_test_2";
const TAG = "活跃";

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.BASE_URL ?? "");

// Opt-in twice over. Pointing this at a local stack is only ever a rehearsal
// to shake out selector mistakes before running it for real, and saying so
// explicitly keeps that from happening by accident.
test.skip(
  !process.env.BASE_URL || (isLocal && !process.env.DRY_RUN_LOCAL),
  "production-only suite: set BASE_URL to the deployed site (or DRY_RUN_LOCAL=1 to rehearse)",
);

// One shared page, stepped through in order — this is a single acceptance
// walk-through, not a set of independent cases.
test.describe.configure({ mode: "serial" });

async function openRoster(page: Page, scope: "active" | "archived" = "active") {
  await page.goto("/students");
  await expect(page.getByRole("heading", { name: "学员" })).toBeVisible();
  if (scope === "archived") {
    await page.getByRole("button", { name: /^已归档/ }).click();
  }
}

async function selectTestStudent(page: Page) {
  await page.getByPlaceholder(/搜索/).fill(TEST_EMAIL);
  await page.getByRole("cell", { name: TEST_NAME }).click();
}

function detailRow(page: Page, field: string) {
  return page.locator(`[data-field="${field}"]`);
}

/**
 * Wait for a write to land before navigating away.
 *
 * Navigating while the Server Action's POST is still open cancels it, and the
 * assertion that follows then fails for a reason that has nothing to do with
 * the application. Waiting for the in-progress marker to clear also asserts
 * something worth asserting: that the action actually completed.
 */
/**
 * Wait for the detail panel to unmount.
 *
 * Archive and restore close it on success, so its absence is the completion
 * signal. Watching a button label instead does not work: the buttons either
 * swap out when the confirmation opens or change their text while the write is
 * in flight, so a name-based locator empties immediately and the wait passes
 * before anything has happened.
 */
/**
 * How long to wait on anything that follows a write.
 *
 * The backend sleeps when idle, so the first write of a run can sit through a
 * cold start. Playwright's 5s assertion default is fine locally and far too
 * short here — and it fails looking exactly like a missing feature.
 */
const WRITE_TIMEOUT = 45_000;

async function panelClosed(page: Page) {
  await expect(page.locator('[data-field="wechat"]')).toHaveCount(0, {
    timeout: WRITE_TIMEOUT,
  });
}

async function settled(page: Page, field: string) {
  const row = detailRow(page, field);
  await expect(row).not.toHaveAttribute("aria-busy", "true", { timeout: WRITE_TIMEOUT });
}

test.describe("production acceptance", () => {
  test("creating the record persists it", async ({ page }) => {
    await openRoster(page);
    await page.getByRole("button", { name: "新增学员" }).click();
    await page.getByPlaceholder("如 陈嘉禾").fill(TEST_NAME);
    await page.getByPlaceholder("name@example.com").fill(TEST_EMAIL);
    // Filled at creation time on purpose. This is where the reported defect
    // was: the modal collected a wechat handle and the create request dropped
    // it, so the field came back empty and the value was simply gone.
    await page.getByPlaceholder("可留空").fill(WECHAT);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    // The modal closes once the record is created.
    await expect(page.getByPlaceholder("name@example.com")).toHaveCount(0, {
      timeout: WRITE_TIMEOUT,
    });

    await openRoster(page);
    await page.getByPlaceholder(/搜索/).fill(TEST_EMAIL);
    await expect(page.getByRole("cell", { name: TEST_NAME })).toBeVisible();

    await page.getByRole("cell", { name: TEST_NAME }).click();
    await expect(detailRow(page, "wechat")).toContainText(WECHAT);
  });

  test("editing a field persists it", async ({ page }) => {
    await openRoster(page);
    await selectTestStudent(page);

    await detailRow(page, "wechat").getByRole("button").click();
    await detailRow(page, "wechat").getByRole("textbox").fill(WECHAT_EDITED);
    await page.keyboard.press("Enter");
    await settled(page, "wechat");
    // Present without a reload — the revalidation brought the stored value back.
    await expect(detailRow(page, "wechat")).toContainText(WECHAT_EDITED);

    await openRoster(page);
    await selectTestStudent(page);
    await expect(detailRow(page, "wechat")).toContainText(WECHAT_EDITED);
  });

  test("tagging persists", async ({ page }) => {
    await openRoster(page);
    await selectTestStudent(page);

    await page.getByRole("button", { name: "编辑" }).click();
    await detailRow(page, "tags").getByRole("button", { name: TAG }).click();
    await settled(page, "tags");
    await page.getByRole("button", { name: "完成" }).click();

    await openRoster(page);
    await selectTestStudent(page);
    await expect(detailRow(page, "tags")).toContainText(TAG);
  });

  test("archiving removes the student from the in-study roster", async ({ page }) => {
    await openRoster(page);
    await selectTestStudent(page);

    await page.getByRole("button", { name: "归档学员" }).click();
    await page.getByRole("button", { name: "确认归档" }).click();
    await panelClosed(page);

    await openRoster(page);
    await page.getByPlaceholder(/搜索/).fill(TEST_EMAIL);
    await expect(page.getByRole("cell", { name: TEST_NAME })).toHaveCount(0);

    await openRoster(page, "archived");
    await page.getByPlaceholder(/搜索/).fill(TEST_EMAIL);
    await expect(page.getByRole("cell", { name: TEST_NAME })).toBeVisible();
  });

  test("creating the same email again is refused as an archived collision", async ({ page }) => {
    // While the record is archived, the roster's own duplicate check cannot see
    // it — this collision is only detectable at the server.
    await openRoster(page);
    await page.getByRole("button", { name: "新增学员" }).click();
    await page.getByPlaceholder("如 陈嘉禾").fill("重复提交");
    await page.getByPlaceholder("name@example.com").fill(TEST_EMAIL);
    await page.getByRole("button", { name: "保存", exact: true }).click();

    await expect(page.getByText(/该邮箱属于一位已归档的学员/)).toBeVisible({
      timeout: WRITE_TIMEOUT,
    });
    await expect(page.getByRole("button", { name: "前往「已归档」" })).toBeVisible();

    // Nothing was created, and the archived record was neither overwritten nor
    // quietly restored.
    await openRoster(page, "archived");
    await page.getByPlaceholder(/搜索/).fill(TEST_EMAIL);
    await expect(page.getByRole("cell", { name: TEST_NAME })).toHaveCount(1);
    await expect(page.getByRole("cell", { name: "重复提交" })).toHaveCount(0);
  });

  test("restoring brings the record back with its fields intact", async ({ page }) => {
    await openRoster(page, "archived");
    await selectTestStudent(page);
    await page.getByRole("button", { name: "恢复为在读" }).click();
    await panelClosed(page);

    await openRoster(page);
    await selectTestStudent(page);
    // The archive round trip is a soft delete: the wechat handle and the tag
    // set before archiving are both still there.
    await expect(detailRow(page, "wechat")).toContainText(WECHAT_EDITED);
    await expect(detailRow(page, "tags")).toContainText(TAG);
  });

  test("creating the same email again is refused as a plain duplicate", async ({ page }) => {
    await openRoster(page);
    await page.getByRole("button", { name: "新增学员" }).click();
    await page.getByPlaceholder("如 陈嘉禾").fill("重复提交");
    await page.getByPlaceholder("name@example.com").fill(TEST_EMAIL);

    await expect(page.getByText(/该邮箱已存在/)).toBeVisible();

    await page.getByRole("button", { name: "取消" }).click();
    await openRoster(page);
    await page.getByPlaceholder(/搜索/).fill(TEST_EMAIL);
    await expect(page.getByRole("cell", { name: TEST_NAME })).toHaveCount(1);
  });
});
