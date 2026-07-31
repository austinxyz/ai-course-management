// 生产可视验收：作业页在真实浏览器里能用、且够得着全部行。
//
// **不截图、不打印任何学员姓名或邮箱** —— 生产上是真实学员数据，
// 截图与文本都会留在对话记录里。只断言计数与几何。
//
// 生产站点密码在 .env.prod.local，与本地那份**不是同一个值**；用错只表现为 401，
// 而 401 长得跟"还没部署完""realm 不对"完全一样。
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = readFileSync(
  "C:/Users/lorra/projects/ai-course-management/frontend/.env.prod.local",
  "utf8",
);
const password = env.match(/^SITE_PASSWORD=(.*)$/m)?.[1]?.trim();
if (!password) throw new Error("SITE_PASSWORD not found in .env.prod.local");

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  httpCredentials: { username: "admin", password },
});
const page = await context.newPage();

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("https://ai-course-management.vercel.app/homework", {
  waitUntil: "domcontentloaded",
});

// 等只有数据到位才会出现的东西——不用 networkidle：Render 冷启动期间请求
// 持续在飞，networkidle 会一直等到超时，而报错会指向后面那个 waitFor。
try {
  await page.getByRole("button", { name: /全部/ }).waitFor({ timeout: 90_000 });
} catch (e) {
  // 不打页面全文——生产上是真实学员数据。只打结构性线索。
  const diag = await page.evaluate(() => ({
    url: location.href,
    heading: document.querySelector("h1")?.textContent?.trim(),
    buttons: [...document.querySelectorAll("button")].length,
    links: [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).slice(0, 12),
    bodyLen: document.body.innerText.length,
  }));
  console.log(JSON.stringify({ diag, errors }, null, 2));
  await browser.close();
  process.exit(1);
}

async function inspect(label) {
  return await page.evaluate((label) => {
    const chips = [...document.querySelectorAll("button")]
      .map((b) => b.textContent?.trim())
      .filter((t) => /^(全部|已交|未交|待回复)\s+\d+$/.test(t ?? ""));
    const table = document.querySelector("table");
    const frame = table?.parentElement;
    const rows = document.querySelectorAll("tbody tr");
    return {
      label,
      filters: chips,
      rows: rows.length,
      frameHeight: frame ? Math.round(frame.getBoundingClientRect().height) : null,
      tableHeight: table ? Math.round(table.getBoundingClientRect().height) : null,
      // 外框被压扁就是裁切缺陷；两者应当基本相等
      frameFitsTable:
        frame && table
          ? Math.abs(frame.getBoundingClientRect().height - table.getBoundingClientRect().height) < 8
          : null,
    };
  }, label);
}

const out = [];
for (const short of ["S1", "S2", "S3", "S4"]) {
  const chip = page.getByRole("link", { name: short, exact: true });
  if ((await chip.count()) === 0) continue;
  await chip.click();
  await page.waitForURL(/course=/, { timeout: 60_000 });
  await page.waitForTimeout(800);
  out.push(await inspect(short));
}

// 最长的那门课滚到底，确认最后一行够得着
await page.getByRole("link", { name: "S1", exact: true }).click();
await page.waitForTimeout(1200);
await page.evaluate(() => {
  let el = document.querySelector("table")?.parentElement?.parentElement;
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    if (s.overflowY === "auto" || s.overflowY === "scroll") {
      el.scrollTop = el.scrollHeight;
      return;
    }
    el = el.parentElement;
  }
});
await page.waitForTimeout(400);
const lastReachable = await page.evaluate(() => {
  const rows = document.querySelectorAll("tbody tr");
  const box = rows[rows.length - 1].getBoundingClientRect();
  return { bottom: Math.round(box.bottom), viewport: window.innerHeight, reachable: box.bottom <= window.innerHeight + 1 };
});

// 只读：页面上不该有任何写入控件
const writeControls = await page.evaluate(
  () =>
    [...document.querySelectorAll("button")].filter((b) =>
      /修改|删除|新增|同步|补录|编辑|保存/.test(b.textContent ?? ""),
    ).length,
);

console.log(JSON.stringify({ perCourse: out, lastReachable, writeControls, errors }, null, 2));
await browser.close();
