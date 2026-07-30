import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CoursesClient } from "./CoursesClient";
import type { Course } from "./types";

/**
 * 场次时间断言只拿亚洲时区比。
 *
 * 美西与美东同日切换夏令时，两者恒差 3 小时 —— 那条断言无论换算写得对不对都会通过。
 * 中国不用夏令时，所以美西→上海的时差在 15 与 16 小时之间跳，这才验得出东西。
 */
const october: Course["sessions"][number] = {
  id: "s-oct",
  local_date: "2026-10-15",
  local_time: "19:30:00",
  tz: "America/Los_Angeles",
  teacher: "讲师甲",
  note: "第一场",
  // 2026-10-15 19:30 PDT = 2026-10-16 02:30Z
  starts_at: "2026-10-16T02:30:00+00:00",
  state: "pending",
  state_is_override: false,
};

const december: Course["sessions"][number] = {
  ...october,
  id: "s-dec",
  local_date: "2026-12-15",
  note: "",
  // 2026-12-15 19:30 PST = 2026-12-16 03:30Z
  starts_at: "2026-12-16T03:30:00+00:00",
};

const course: Course = {
  id: "c-1",
  name: "Claude 实战入门",
  short: "入门",
  tagline: "讲给谁、一次课解决什么问题",
  intro: "这门课怎么上、上完能做到什么",
  duration_minutes: 150,
  default_tz: "America/Los_Angeles",
  homework_title: "用 Claude 完成一件自己的真实工作",
  offline: false,
  aliases: [{ raw: "S1" }, { raw: "Session 1" }],
  sessions: [october, december],
};

function sessionRow(id: string): HTMLElement {
  return document.querySelector(`[data-session="${id}"]`) as HTMLElement;
}

describe("CoursesClient", () => {
  it("shows the selected course's own fields", () => {
    render(<CoursesClient courses={[course]} teachers={["讲师甲"]} />);

    expect(screen.getByRole("heading", { name: course.name })).toBeInTheDocument();
    expect(screen.getByText(course.tagline)).toBeInTheDocument();
    expect(screen.getByText(course.intro)).toBeInTheDocument();
    expect(screen.getByText(course.homework_title)).toBeInTheDocument();
    expect(screen.getByText("截止日期按场次定")).toBeInTheDocument();
  });

  it("lists the platform aliases with the spelling that was entered", () => {
    // 匹配用的是归一化后的值，但显示要保留用户当初的写法 —— `Session 1` 比
    // `session 1` 好读，而人核对平台数据时看的是自己填的那个写法。
    render(<CoursesClient courses={[course]} teachers={[]} />);

    expect(screen.getByText("S1")).toBeInTheDocument();
    expect(screen.getByText("Session 1")).toBeInTheDocument();
    expect(screen.getByText("导入时按这些写法匹配到本课程")).toBeInTheDocument();
  });

  it("converts each session into the other zones by IANA rules", () => {
    render(<CoursesClient courses={[course]} teachers={[]} />);

    // 两场都是美西 19:30
    expect(within(sessionRow("s-oct")).getByText(/19:30/)).toBeInTheDocument();
    expect(within(sessionRow("s-dec")).getByText(/19:30/)).toBeInTheDocument();

    // 上海行：10 月那场次日 10:30，12 月那场次日 11:30
    expect(within(sessionRow("s-oct")).getByText(/上海.*10:30/)).toBeInTheDocument();
    expect(within(sessionRow("s-dec")).getByText(/上海.*11:30/)).toBeInTheDocument();
  });

  it("shows each session's own teacher", () => {
    const twoTeachers = {
      ...course,
      sessions: [october, { ...december, teacher: "讲师乙" }],
    };
    render(<CoursesClient courses={[twoTeachers]} teachers={[]} />);

    expect(within(sessionRow("s-oct")).getByText("讲师甲")).toBeInTheDocument();
    expect(within(sessionRow("s-dec")).getByText("讲师乙")).toBeInTheDocument();
  });

  it("says what an unscheduled course is missing", () => {
    render(<CoursesClient courses={[{ ...course, sessions: [] }]} teachers={[]} />);

    expect(
      screen.getByText(
        "还没有排课。加一个上课时间后，这门课才会出现在报课的场次选项里。",
      ),
    ).toBeInTheDocument();
  });

  it("keeps an offline course listed and marks it", () => {
    // 已下线不是删除。它得留在列表里带标记 —— 否则"这门课去哪了"无从回答。
    render(<CoursesClient courses={[{ ...course, offline: true }]} teachers={[]} />);

    expect(screen.getAllByText("已下线").length).toBeGreaterThan(0);
  });

  it("switches the detail panel when another course is picked", () => {
    const other: Course = { ...course, id: "c-2", name: "第二门课", sessions: [] };
    render(<CoursesClient courses={[course, other]} teachers={[]} />);

    return userEvent
      .setup()
      .click(screen.getByRole("button", { name: /第二门课/ }))
      .then(() => {
        expect(screen.getByRole("heading", { name: "第二门课" })).toBeInTheDocument();
      });
  });

  it("renders an empty database without a course to select", () => {
    render(<CoursesClient courses={[]} teachers={[]} />);

    expect(screen.getByText("还没有课程")).toBeInTheDocument();
  });
});
