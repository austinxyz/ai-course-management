import { getCourses, getHomework } from "@/lib/api";
import { HomeworkClient } from "./HomeworkClient";

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

  // 默认选第一门。课程列表本身已经按最近开课排过序，所以"第一门"是有含义的，
  // 不是堆顺序里碰巧排在前面的那一门。
  const courseId = course && courses.some((c) => c.id === course) ? course : courses[0]?.id;

  const people = courseId ? await getHomework(courseId) : [];

  return (
    <HomeworkClient
      courses={courses.map((c) => ({ id: c.id, name: c.name, short: c.short }))}
      courseId={courseId ?? ""}
      people={people}
    />
  );
}
