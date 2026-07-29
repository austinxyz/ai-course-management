import { render, screen } from "@testing-library/react";
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
    render(<StudentsClient students={[unalignedStudent]} archivedStudents={[]} />);

    // The lone student is also auto-selected (first in list), so the badge
    // renders both in the table row and the detail panel — either instance
    // must carry the danger token.
    const badges = screen.getAllByText("未对齐微信");
    expect(badges.some((el) => el.className.match(/bg-danger/))).toBe(true);
  });
});
