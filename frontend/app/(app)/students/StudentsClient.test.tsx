import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudentsClient } from "./StudentsClient";
import type { Student } from "./types";

const unalignedStudent: Student = {
  name: "林敏",
  email: "lin.min@example.com",
  gender: "女",
  age: "25-30",
  industry: "留学 · 在读",
  wechat: "",
  nick: "敏敏",
  wxName: "Min Lin",
  source: "理财群",
  region: "美西",
  tz: "UTC-8",
  level: "小白",
  tags: ["新报名"],
  note: "",
};

describe("StudentsClient", () => {
  it("renders the 未对齐微信 badge with the danger design token for a student with no wechat", () => {
    render(<StudentsClient students={[unalignedStudent]} archivedStudents={[]} enrollments={[]} courses={[]} />);

    // The lone student is also auto-selected (first in list), so the badge
    // renders both in the table row and the detail panel — either instance
    // must carry the danger token.
    const badges = screen.getAllByText("未对齐微信");
    expect(badges.some((el) => el.className.match(/bg-danger/))).toBe(true);
  });

  it("按姓名排序展示，不把未对齐微信的人单独排到最前面", () => {
    // 三人本来就按姓名传进来（后端已经排好序）：艾米（无微信）、鲍勃（有微信）、
    // 陈晨（无微信）。以前的实现会先按"有没有微信"重排，鲍勃会被挤到最后——
    // 名单的顺序因此跟"谁交流过微信"这件事绑在一起，而不是单纯的姓名序。
    const students: Student[] = [
      { ...unalignedStudent, name: "艾米", email: "amy@example.com", wechat: "" },
      { ...unalignedStudent, name: "鲍勃", email: "bob@example.com", wechat: "wx_bob" },
      { ...unalignedStudent, name: "陈晨", email: "chen@example.com", wechat: "" },
    ];

    render(<StudentsClient students={students} archivedStudents={[]} enrollments={[]} courses={[]} />);

    const table = screen.getByRole("table");
    const rows = within(table).getAllByText(/^(艾米|鲍勃|陈晨)$/);
    expect(rows.map((el) => el.textContent)).toEqual(["艾米", "鲍勃", "陈晨"]);
  });

  it("does not show a synthesized 学员 ID", () => {
    // The row displayed "stu_" + the email local part — an identifier the
    // database does not have. Email is the student's primary key here, and a
    // value that merely looks like a key invites being used as one.
    render(<StudentsClient students={[unalignedStudent]} archivedStudents={[]} enrollments={[]} courses={[]} />);

    expect(screen.queryByText("学员 ID")).not.toBeInTheDocument();
    expect(document.querySelector('[data-field="sid"]')).toBeNull();
  });
});
