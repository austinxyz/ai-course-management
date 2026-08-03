import { getCourses, getHomework, getLastImport } from "@/lib/api";
import { HomeworkClient } from "./HomeworkClient";
import { pickCourse } from "./pickCourse";

/**
 * 作业页。课程走 URL 参数，切课是一次真正的导航。
 *
 * 这样取数留在 Server Component 里——浏览器不直连 FastAPI。
 * 把课程做成客户端状态的话，切课就得从浏览器发请求，那是架构违规。
 */
export default async function HomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; student?: string }>;
}) {
  const { course, student } = await searchParams;
  const courses = await getCourses();

  // 默认落在第一门**有人报课**的课上，不是列表第一门——课程列表按最近开课倒序，
  // 而那个顺序与"这门课有没有人"完全不相干（生产上排最前的 S4 一条报课都没有）。
  const courseId = pickCourse(courses, course);

  // 两条独立的取数并发发出：串行的话这一页的首屏要等两个来回，
  // 而每次往返实测 ≈ 61ms（Render → Supabase），且后端是免费档、会冷启动。
  //
  // 两者的失败**处置相反**，所以不能一把 Promise.all 了事：
  //
  // - 名单取不到 → 照常抛，交给 `(app)/error.tsx`。名单是这一页存在的理由，
  //   它挂了还渲染一个空页面，看起来就是"这门课没有人"——一个假事实。
  // - 「上次导入」取不到 → 退成 null。它是一行说明性的字，
  //   为它把整份名单一起换成错误卡片，代价与收益完全不成比例。
  const [people, lastImport] = courseId
    ? await Promise.all([
        getHomework(courseId),
        getLastImport(courseId).catch(() => null),
      ])
    : [[], null];

  return (
    <HomeworkClient
      courses={courses.map((c) => ({ id: c.id, name: c.name, short: c.short }))}
      courseId={courseId ?? ""}
      people={people}
      lastImport={lastImport}
      initialSelectedEmail={student ?? null}
    />
  );
}
