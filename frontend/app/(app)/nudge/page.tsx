import { pickCourse } from "@/app/(app)/homework/pickCourse";
import { getCourses, getNudgeList } from "@/lib/api";
import { NudgeClient } from "./NudgeClient";

/**
 * 催作业页。课程走 URL 参数，切课是一次真正的导航——理由同 `/homework` 页：
 * 浏览器不直连 FastAPI，切课做成客户端状态就得从浏览器发请求。
 */
export default async function NudgePage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const { course } = await searchParams;
  const courses = await getCourses();
  const courseId = pickCourse(courses, course);

  const people = courseId ? await getNudgeList(courseId) : [];

  return (
    <NudgeClient
      courses={courses.map((c) => ({ id: c.id, name: c.name }))}
      courseId={courseId ?? ""}
      people={people}
    />
  );
}
