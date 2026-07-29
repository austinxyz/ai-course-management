import { expect, test, type Page } from "@playwright/test";

/**
 * Regression cover for the change that removed the client's local copy of the
 * student list.
 *
 * Search, the tag and source filters, the wechat-alignment tri-state, the
 * 在读/已归档 toggle, row selection and the new-student modal all used to read
 * `over` / `added` / `archived`. Those are gone, so every one of them is a
 * candidate for having broken — the blast radius here is much wider than "a
 * few write endpoints were added".
 */

const SHOT_DIR = process.env.SHOT_DIR ?? "test-results/states";

async function gotoRoster(page: Page) {
  await page.goto("/students");
  await expect(page.getByRole("heading", { name: "学员" })).toBeVisible();
}

function detailRow(page: Page, field: string) {
  return page.locator(`[data-field="${field}"]`);
}

test.describe("existing interactions still work without the local state", () => {
  test("search narrows the roster by name and by email", async ({ page }) => {
    await gotoRoster(page);
    const rows = page.locator("tbody tr");
    const total = await rows.count();
    expect(total).toBeGreaterThan(1);

    await page.getByPlaceholder(/搜索/).fill("陈嘉禾");
    await expect(rows).toHaveCount(1);

    await page.getByPlaceholder(/搜索/).fill("zhao.ziqian@example.com");
    await expect(rows).toHaveCount(1);

    await page.getByPlaceholder(/搜索/).fill("");
    await expect(rows).toHaveCount(total);
  });

  test("the wechat alignment tri-state splits the roster", async ({ page }) => {
    await gotoRoster(page);
    const rows = page.locator("tbody tr");
    const total = await rows.count();

    await page.getByRole("button", { name: /^已对齐/ }).click();
    const aligned = await rows.count();
    await page.getByRole("button", { name: /^未对齐微信/ }).click();
    const unaligned = await rows.count();

    expect(aligned + unaligned).toBe(total);
    expect(unaligned).toBeGreaterThan(0);
  });

  test("tag and source filters apply and reset", async ({ page }) => {
    await gotoRoster(page);
    const rows = page.locator("tbody tr");
    const total = await rows.count();
    // Scoped to the filter bar: the same tag names appear again inside the
    // detail panel, where they are edit controls rather than filters.
    const filters = page.getByRole("toolbar", { name: "筛选" });

    await filters.getByRole("button", { name: "活跃", exact: true }).click();
    const tagged = await rows.count();
    expect(tagged).toBeLessThan(total);

    await filters.getByRole("button", { name: "讲武堂", exact: true }).click();
    expect(await rows.count()).toBeLessThanOrEqual(tagged);

    await page.getByRole("button", { name: "清除筛选" }).click();
    await expect(rows).toHaveCount(total);
  });

  test("clicking a row drives the detail panel", async ({ page }) => {
    await gotoRoster(page);
    await page.getByRole("cell", { name: "赵子谦" }).click();

    await expect(page.getByText("zhao.ziqian@example.com").last()).toBeVisible();
    await expect(detailRow(page, "wechat")).toContainText("zzq_dev");

    await page.getByRole("cell", { name: "苏晚" }).click();
    await expect(detailRow(page, "wechat")).toContainText("suwan_ing");
  });

  test("the 在读 / 已归档 toggle switches which list is shown", async ({ page }) => {
    await gotoRoster(page);
    const rows = page.locator("tbody tr");
    const active = await rows.count();

    const activeEmails = await rows.locator("td:nth-child(2)").allInnerTexts();

    await page.getByRole("button", { name: /^已归档/ }).click();
    const archivedEmails = await rows.locator("td:nth-child(2)").allInnerTexts();
    // The two lists must be disjoint. Showing the same people under both
    // headings is exactly what the removed local `archived` array used to do
    // once its contents drifted from the database.
    for (const email of archivedEmails) expect(activeEmails).not.toContain(email);

    await page.getByRole("button", { name: /^在读/ }).click();
    await expect(rows).toHaveCount(active);
  });

  test("the new-student modal opens and closes", async ({ page }) => {
    await gotoRoster(page);
    await page.getByRole("button", { name: "新增学员" }).click();
    await expect(page.getByPlaceholder("name@example.com")).toBeVisible();

    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByPlaceholder("name@example.com")).not.toBeVisible();
  });
});

test.describe("the four write states from the mock", () => {
  test("a field being saved dims and spins, alone", async ({ page }) => {
    await gotoRoster(page);
    // Hold the Server Action's POST open so the in-flight state stays on
    // screen long enough to look at.
    await page.route("**/students", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await new Promise((r) => setTimeout(r, 4000));
      await route.fallback();
    });

    await page.getByRole("cell", { name: "苏晚" }).click();
    await detailRow(page, "industry").getByRole("button").click();
    await detailRow(page, "industry").getByRole("textbox").fill("教育 · 讲师");
    await page.keyboard.press("Enter");

    await expect(detailRow(page, "industry")).toHaveAttribute("aria-busy", "true");
    // The neighbouring row stays live — no panel-wide mask.
    await expect(detailRow(page, "gender")).not.toHaveAttribute("aria-busy", "true");
    await expect(detailRow(page, "gender").getByRole("button")).toBeEnabled();

    await page.screenshot({ path: `${SHOT_DIR}/01-field-saving.png`, fullPage: false });
  });

  test("a failed save keeps the typed value and explains itself in place", async ({ page }) => {
    await gotoRoster(page);
    await page.route("**/students", (route) =>
      route.request().method() === "POST" ? route.abort("failed") : route.fallback(),
    );

    await page.getByRole("cell", { name: "苏晚" }).click();
    await detailRow(page, "industry").getByRole("button").click();
    await detailRow(page, "industry").getByRole("textbox").fill("教育 · 讲师");
    await page.keyboard.press("Enter");

    const row = detailRow(page, "industry");
    await expect(row.getByText("没保存上。")).toBeVisible();
    await expect(row.getByRole("button", { name: "重试" })).toBeVisible();
    // The important one: what the user typed is still there.
    await expect(row.getByRole("textbox")).toHaveValue("教育 · 讲师");
    await expect(row).not.toContainText("产品");

    await page.screenshot({ path: `${SHOT_DIR}/02-field-failed.png` });
  });

  test("archiving disables its button and says so", async ({ page }) => {
    await gotoRoster(page);
    await page.route("**/students", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await new Promise((r) => setTimeout(r, 4000));
      await route.fallback();
    });

    await page.getByRole("cell", { name: "马若" }).click();
    await page.getByRole("button", { name: "归档学员" }).click();
    await page.getByRole("button", { name: "确认归档" }).click();

    await expect(page.getByRole("button", { name: "正在归档…" })).toBeDisabled();
    await page.screenshot({ path: `${SHOT_DIR}/03-archiving.png` });
  });

  test("creating with an archived student's email explains the collision", async ({ page }) => {
    // Seeded by the runner: ARCHIVED_EMAIL is archived through the API before
    // this spec runs, so the collision is a real server response rather than
    // something stubbed in the browser.
    const email = process.env.ARCHIVED_EMAIL;
    test.skip(!email, "ARCHIVED_EMAIL not set");

    await gotoRoster(page);
    await page.getByRole("button", { name: "新增学员" }).click();
    await page.getByPlaceholder("如 陈嘉禾").fill("同名的人");
    await page.getByPlaceholder("name@example.com").fill(email!);
    await page.getByRole("button", { name: "保存", exact: true }).click();

    await expect(page.getByText(/该邮箱属于一位已归档的学员/)).toBeVisible();
    await expect(page.getByRole("button", { name: "前往「已归档」" })).toBeVisible();

    await page.screenshot({ path: `${SHOT_DIR}/04-archived-email-conflict.png` });
  });
});
