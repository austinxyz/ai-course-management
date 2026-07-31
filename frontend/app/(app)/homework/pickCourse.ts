/** 选课只需要这两样，所以不吃整个 Course —— 测试也就不用造一整个课程对象。 */
interface Selectable {
  id: string;
  enrolled_people: number;
}

/**
 * 作业页默认落在哪门课。
 *
 * **不是列表第一门。** 课程列表按最近开课倒序排，而那个顺序看的是**场次日期**，
 * 与"这门课有没有人报"完全不相干 —— 生产上排最前的 S4 一条报课都没有，
 * 于是打开 `/homework` 第一眼是空状态。空页面不报错也不告警，
 * 看起来就像功能没做好。
 *
 * URL 显式指定的课程一律优先，包括没人报课的那门：用户点了那个 chip，
 * 就该看到那门课的空状态，而不是被弹回别处。
 */
export function pickCourse(courses: Selectable[], requested: string | undefined) {
  if (requested && courses.some((c) => c.id === requested)) return requested;
  const withPeople = courses.find((c) => c.enrolled_people > 0);
  return (withPeople ?? courses[0])?.id;
}
