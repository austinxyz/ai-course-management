import { describe, expect, it } from "vitest";

import { pickCourse } from "./pickCourse";

/**
 * 作业页默认落在哪门课。
 *
 * 生产验收时撞到的：课程列表按最近开课倒序，排在最前的是 S4 —— 而 S4 一条报课
 * 都没有，于是打开 `/homework` 第一眼是空状态。排序看的是**场次日期**，
 * 与"这门课有没有人"无关，两者恰好可以完全不相干。
 *
 * 空页面不报错、不告警，看起来就像功能没做好。
 */
const COURSES = [
  { id: "s4", enrolled_people: 0 },
  { id: "s3", enrolled_people: 1 },
  { id: "s1", enrolled_people: 17 },
];

describe("默认课程", () => {
  it("落在第一门有人报课的课上，而不是列表第一门", () => {
    expect(pickCourse(COURSES, undefined)).toBe("s3");
  });

  it("URL 指定了哪门就是哪门——包括没人报课的那门", () => {
    // 用户点了 S4 的 chip 就该看到 S4 的空状态，而不是被弹回别处
    expect(pickCourse(COURSES, "s4")).toBe("s4");
  });

  it("URL 里的 id 不存在时退回默认，不是原样透传", () => {
    expect(pickCourse(COURSES, "nope")).toBe("s3");
  });

  it("所有课都没人报课时仍给出第一门，让用户看到空状态而不是空白页", () => {
    expect(pickCourse([{ id: "s4", enrolled_people: 0 }], undefined)).toBe("s4");
  });

  it("一门课都没有时返回 undefined", () => {
    expect(pickCourse([], undefined)).toBeUndefined();
  });
});
