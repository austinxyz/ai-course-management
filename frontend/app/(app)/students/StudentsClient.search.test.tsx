import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { StudentsClient } from "./StudentsClient";
import type { Student } from "./types";

/**
 * Search exists for one workflow: matching a WeChat group roster against the
 * database by hand. The only handle available in that moment is the group
 * nickname — the person's real name may differ and their email is unknown,
 * which is exactly why the alignment is manual (see docs/requirements.md §5).
 *
 * Fictional fixtures only; the repo must never carry real student data.
 */
const target: Student = {
  name: "王小明",
  email: "xiaoming.wang@example.com",
  gender: "男",
  age: "30-35",
  industry: "制造 · 管理",
  wechat: "wx_handle_abc",
  nick: "群里叫我阿明",
  wxName: "Ming Wang",
  source: "讲武堂",
  region: "美东",
  tz: "UTC-5",
  level: "小白",
  tags: ["新报名"],
  note: "备注里写了 独特词串 供测试",
};

const other: Student = {
  ...target,
  name: "李四",
  email: "li.si@example.com",
  wechat: "wx_other",
  nick: "另一个人",
  wxName: "Si Li",
  tags: [],
  note: "",
};

/**
 * The filter input is the only textbox on the page until a field is put into
 * edit mode, so role alone identifies it. Querying by placeholder would tie
 * every case to the placeholder string, which is itself under test below.
 */
function searchBox(): HTMLElement {
  return screen.getByRole("textbox");
}

/**
 * Names currently listed in the table.
 *
 * Scoped to the table body for two reasons: the first row is auto-selected, so
 * its name also renders in the detail panel and an unscoped query cannot tell
 * "is in the filtered list" from "is open on the right"; and when nothing
 * matches, the table is replaced by the empty state, so the absence of a table
 * has to read as an empty list rather than as an error.
 */
function listedNames(): string[] {
  const body = screen.queryByRole("table")?.querySelector("tbody");
  if (!body) return [];
  return Array.from(body.querySelectorAll("tr")).map((tr) =>
    (tr.querySelector("td")?.textContent ?? "").trim(),
  );
}

function renderAndSearch(query: string) {
  render(<StudentsClient students={[target, other]} archivedStudents={[]} />);
  return userEvent.setup().type(searchBox(), query);
}

describe("roster search", () => {
  it("matches a WeChat nickname fragment", async () => {
    await renderAndSearch("阿明");

    expect(listedNames()).toContain(target.name);
    expect(listedNames()).not.toContain(other.name);
  });

  it("matches a WeChat display-name fragment", async () => {
    await renderAndSearch("Ming W");

    expect(listedNames()).toContain(target.name);
    expect(listedNames()).not.toContain(other.name);
  });

  it("matches a WeChat handle fragment", async () => {
    // "which person is this handle?" — the reverse of the alignment lookup.
    await renderAndSearch("handle_abc");

    expect(listedNames()).toContain(target.name);
    expect(listedNames()).not.toContain(other.name);
  });

  it("ignores case", async () => {
    await renderAndSearch("MING w");

    expect(listedNames()).toContain(target.name);
  });

  it("still matches name and email", async () => {
    await renderAndSearch("xiaoming.wang");

    expect(listedNames()).toContain(target.name);
    expect(listedNames()).not.toContain(other.name);
  });

  it("does not match text that only appears in the note", async () => {
    // Notes hold long pasted write-ups. Matching them would drown the signal
    // in prose, and the note is not a way anyone identifies a person.
    await renderAndSearch("独特词串");

    expect(listedNames()).not.toContain(target.name);
  });

  it("does not match text that only appears in a tag", async () => {
    // Tags have their own filter; matching them here would make "why is this
    // row in my results" ambiguous.
    await renderAndSearch("新报名");

    expect(listedNames()).not.toContain(target.name);
  });

  it("tells the user that WeChat fields are searchable", async () => {
    // The placeholder is the only place this is discoverable. A user who
    // believes only name and email are searchable will not try a nickname —
    // and the nickname is the whole point.
    render(<StudentsClient students={[target]} archivedStudents={[]} />);

    expect(searchBox()).toHaveAttribute(
      "placeholder",
      "搜索姓名 / 邮箱 / 微信",
    );
  });
});
