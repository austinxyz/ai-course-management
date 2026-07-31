import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CoursesClient } from "./CoursesClient";
import type { Course } from "./types";

const session = {
  id: "s-oct",
  local_date: "2026-10-15",
  local_time: "19:30:00",
  tz: "America/Los_Angeles",
  teacher: "讲师甲",
  note: "",
  starts_at: "2026-10-16T02:30:00+00:00",
  state: "pending" as const,
  state_is_override: false,
  enrolled_count: 0,
};

const course: Course = {
  id: "c-1",
  name: "Claude 实战入门",
  short: "入门",
  tagline: "讲给谁",
  intro: "怎么上",
  duration_minutes: 150,
  default_tz: "America/Los_Angeles",
  homework_title: "作业题",
  offline: false,
  aliases: [],
  sessions: [session],
  undecided_count: 0,
  enrolled_people: 0,
};

/**
 * Both numbers vanish at zero.
 *
 * Not displaying 0 rather than displaying it is this capability's existing
 * judgement: a course whose sittings are scheduled but not yet open for
 * enrolment would otherwise be a wall of 「已报 0 人」, which carries nothing.
 */
describe("enrolment numbers on the course page", () => {
  it("shows the head count on a sitting that has people", () => {
    render(
      <CoursesClient
        courses={[{ ...course, sessions: [{ ...session, enrolled_count: 8 }] }]}
        teachers={[]}
      />,
    );

    expect(screen.getByText("已报 8 人")).toBeInTheDocument();
  });

  it("shows no number at all on a sitting nobody has signed up for", () => {
    render(<CoursesClient courses={[course]} teachers={[]} />);

    expect(screen.queryByText(/已报 .* 人/)).toBeNull();
  });

  /**
   * People with no sitting picked belong to no session row, so without a
   * separate line they are invisible on this page — and the gap between
   * "16 enrolled" and "13 across the sittings" has nowhere to be explained.
   * They are also precisely the ones needing follow-up.
   */
  it("counts the people who have not picked a sitting yet", () => {
    render(<CoursesClient courses={[{ ...course, undecided_count: 3 }]} teachers={[]} />);

    expect(screen.getByText("另有 3 人未定场次")).toBeInTheDocument();
  });

  it("says nothing about undecided people when there are none", () => {
    render(<CoursesClient courses={[course]} teachers={[]} />);

    expect(screen.queryByText(/未定场次/)).toBeNull();
  });
});
