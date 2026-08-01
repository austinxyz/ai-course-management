import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * 走一遍真的导入：真选文件 → 预览 → 标记排除 → 确认写入 → 回作业页。
 *
 * 这一条存在的理由是**别的验证都不覆盖上传那一段**。单元测试里 `onPreview`
 * 是个 mock，后端测试里请求体是手搓的 base64——「浏览器把 File 读成字节、
 * Server Action 转发、后端按内容判编码」这条链只有真点一次才走得到，
 * 而它恰恰是本片最容易出错的地方（在 Next 一侧读成文本就会让 GBK 检测失效，
 * 且**不报错**）。
 */

const SHOT_DIR = process.env.SHOT_DIR ?? "test-results/import-states";
const FIXTURES = process.env.IMPORT_FIXTURES ?? "";

// 断言写给本地 seed 数据，而且会真的写库。指向部署环境既会失败也会留下垃圾。
test.skip(
  !!process.env.BASE_URL && !process.env.BASE_URL.includes("localhost"),
  "local-only suite: BASE_URL points at a deployed environment",
);
test.skip(!FIXTURES, "IMPORT_FIXTURES not set");

function fixture(name: string): string {
  return join(FIXTURES, name);
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true });
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "导入 grades.csv" });

async function gotoHomework(page: Page) {
  await page.goto("/homework");
  await expect(page.getByRole("heading", { name: "作业" })).toBeVisible();
}

/**
 * 真正的「选文件」——`setInputFiles` 走的是浏览器自己的那条路。
 *
 * 外面套 `toPass` 是必须的，不是防御性写法：`setInputFiles` 只要元素挂上了
 * 就会成功，**不等** React 把 onChange 装上去。水合完成之前选中的文件
 * 会被设进 input 里而没有任何人在听——测试于是停在一个没有弹窗、
 * 也没有任何报错的页面上，看起来就像"导入按钮坏了"。
 *
 * 重选同一个文件是安全的：onChange 处理完会把 `value` 清空，
 * 否则连用户自己选第二次同一个文件都触发不了。
 */
async function pick(page: Page, file: string) {
  const input = page.locator('input[type="file"]');
  await expect(async () => {
    // 每次重试前先清空。**不清的话这个循环永远转不出来**：
    // 选同一个文件两次，第二次的文件列表没变，浏览器就不再发 change ——
    // 于是「水合前那一次把文件设进去了但没人听」这个状态会一直卡着，
    // 重试多少次都一样。清空让下一次成为一次真正的变化。
    await input.setInputFiles([]);
    await input.setInputFiles(fixture(file));
    await expect(dialog(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("从浏览器导入 grades.csv", () => {
  test("① 预览：编码、行数对账、三个数、两份分开的清单", async ({ page }) => {
    await gotoHomework(page);
    await shot(page, "0-homework-before");

    await pick(page, "grades.csv");
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole("button", { name: /确认导入/ })).toBeVisible();

    // 编码**始终**显示，包括 UTF-8。夹具带 BOM，走的是 utf-8-sig 那条：
    // 没剥掉的话第一个列名会变成 `﻿姓名`，报出来的错却是"表头缺列"。
    await expect(d).toContainText("按 UTF-8 读取");
    // 7 行里学员丁交了两次，被顶掉一行 → 共 7 → 可用 6。
    await expect(d).toContainText("共 7 行 → 可用 6 行");
    // 两个人不在学员表：`ghost@` 与讲师本人（本地库里没给讲师建档）。
    // 他们的成绩**不会**写入，所以算在「将跳过」里。
    await expect(d.getByTestId("count-skipped")).toHaveText("2");
    // 两份清单彼此分开、语气不同。
    await expect(d.getByTestId("skipped-no-student")).toHaveAttribute("data-tone", "danger");

    await shot(page, "1-preview-utf8");
  });

  test("② 预览期间一条都不写", async ({ page }) => {
    await gotoHomework(page);
    const before = await page.getByRole("button", { name: /^已交/ }).textContent();

    await pick(page, "grades.csv");
    await expect(dialog(page).getByRole("button", { name: /确认导入/ })).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();

    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole("button", { name: /^已交/ })).toHaveText(before ?? "");
  });

  test("③ 标记排除会**重新请求一次预览**，数字由后端重算", async ({ page }) => {
    await gotoHomework(page);
    await pick(page, "grades.csv");
    const d = dialog(page);
    const confirm = d.getByRole("button", { name: /确认导入/ });
    const before = await confirm.textContent();

    // 数一数预览请求。前端自己加减的话，这个数不会涨。
    let previews = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/homework")) previews += 1;
    });

    // 必须标记**将写入**清单里的人。跳过清单里的人本来就不写，
    // 标记他不会让「将导入 N 条」变化——那样这条测试即使功能坏了也照样绿。
    await d
      .getByTestId("write-list")
      .getByRole("button", { name: "以后不算作业" })
      .first()
      .click();
    await expect(confirm).not.toHaveText(before ?? "", { timeout: 30_000 });
    // 4 个人里标掉一个 → 3。数字来自服务端重算，不是前端减出来的。
    await expect(confirm).toHaveText("确认导入 3 条");

    expect(previews).toBeGreaterThan(0);
    await shot(page, "2-after-exclude");
  });

  test("④ 确认写入，作业页跟着变，并出现「上次导入」", async ({ page }) => {
    await gotoHomework(page);
    await pick(page, "grades.csv");
    const d = dialog(page);
    const confirm = d.getByRole("button", { name: /确认导入/ });
    // 按钮上写的是**具体条数**，不是「确认」。
    await expect(confirm).toHaveText(/确认导入 \d+ 条/);

    await confirm.click();
    await expect(d).toBeHidden({ timeout: 60_000 });

    await expect(page.getByRole("button", { name: /^已交/ })).not.toHaveText("已交 0");
    await expect(page.getByTestId("last-import")).toContainText("grades.csv");
    await shot(page, "3-after-import");
  });

  test("⑤ 幂等：同一份文件再导一遍，没有新建", async ({ page }) => {
    await gotoHomework(page);
    await pick(page, "grades.csv");
    const d = dialog(page);
    await expect(d.getByRole("button", { name: /确认导入/ })).toBeVisible();
    // 上一条已经写过一遍，所以这次全是更新。
    await expect(d.getByTestId("count-created")).toHaveText("0");
  });

  test("⑥ GBK 文件：注明按 GBK 读取，中文正常", async ({ page }) => {
    await gotoHomework(page);
    await pick(page, "grades-gbk.csv");
    const d = dialog(page);
    await expect(d).toContainText("按 GBK 读取");
    await expect(d).toContainText("请核对");
    // 中文没被解成另一批字——这是编码判对了的唯一人眼判据。
    // 不钉具体某个人：③ 把 demo0 永久排除了（**跨课程、跨这次运行**都生效），
    // 他在这一屏上只剩邮箱不显示姓名。钉死一个名字会让这条测试
    // 依赖前面几条的执行顺序。
    await expect(d).toContainText(/示例学员[乙丙丁]/);
    await shot(page, "4-gbk");
  });

  test("⑦ 传错文件：说得出这不像作业成绩文件", async ({ page }) => {
    await gotoHomework(page);
    await pick(page, "roster.csv");
    const d = dialog(page);
    await expect(d.getByRole("alert")).toContainText("不是作业成绩文件");
    // 没有可确认的东西，就不该给确认按钮。
    await expect(d.getByRole("button", { name: /确认导入/ })).toHaveCount(0);
    await shot(page, "5-wrong-file");
  });

  test("⑧ 表头不符：警告列出两边，但确认仍可用", async ({ page }) => {
    await gotoHomework(page);
    await pick(page, "grades-other-rubric.csv");
    const d = dialog(page);
    await expect(d.getByTestId("header-warning")).toBeVisible();
    await expect(d.getByTestId("header-warning")).toContainText("E1");
    await expect(d.getByTestId("header-warning")).toContainText("A1");
    // 警告不是拒绝——课程真的改了评分表是合法的。
    await expect(d.getByRole("button", { name: /确认导入/ })).toBeEnabled();
    await shot(page, "6-header-warning");
  });

  test("⑨ 清单长的时候不被裁掉，能滚到最后一行", async ({ page }) => {
    // S1 是 17 行。列表一长就撞上一个**不报错**的失败模式：
    // 外框的 `overflow-hidden`（为了圆角）碰上可压缩的 flex 子项时，
    // 超出的行会被静默裁掉，而外层滚动容器看不到任何溢出，
    // 于是哪儿都没有滚动条——jsdom 量不出来，只有真浏览器看得见。
    await gotoHomework(page);
    await pick(page, "grades-full.csv");
    const d = dialog(page);
    // 这份文件没有重复行也没有缺邮箱的行，所以不写箭头，只报一个数。
    await expect(d).toContainText("17 行");

    const list = d.getByTestId("write-list");
    const box = await list.evaluate((el) => {
      const scroller = el.querySelector("div.overflow-y-auto") as HTMLElement;
      return {
        clipped: !scroller,
        scrollable: scroller ? scroller.scrollHeight > scroller.clientHeight : false,
        overflowY: scroller ? getComputedStyle(scroller).overflowY : null,
      };
    });
    expect(box.clipped).toBe(false);
    // 行数超过面板高度 → 必须真的能滚，而不是被切掉。
    expect(box.scrollable).toBe(true);
    expect(box.overflowY).toBe("auto");

    // 最后一行滚得到、看得见。
    const lastRow = list.locator("div").filter({ hasText: "demo16@example.com" }).last();
    await lastRow.scrollIntoViewIfNeeded();
    await expect(lastRow).toBeVisible();
    await shot(page, "7-long-list");
  });
});

test.afterAll(() => {
  writeFileSync(join(SHOT_DIR, "README.txt"), "homework-import e2e screenshots\n");
});
