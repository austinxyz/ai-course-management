import { getCourses, getHomework } from "@/lib/api";
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
  searchParams: Promise<{ course?: string }>;
}) {
  const { course } = await searchParams;
  const courses = await getCourses();

  // 默认落在第一门**有人报课**的课上，不是列表第一门——课程列表按最近开课倒序，
  // 而那个顺序与"这门课有没有人"完全不相干（生产上排最前的 S4 一条报课都没有）。
  const courseId = pickCourse(courses, course);

  const people = courseId ? await getHomework(courseId) : [];

  return (
    <HomeworkClient
      courses={courses.map((c) => ({ id: c.id, name: c.name, short: c.short }))}
      courseId={courseId ?? ""}
      people={people}
    />
  );
}
