import { getCourses, getTeachers } from "@/lib/api";
import { CoursesClient } from "./CoursesClient";

export default async function CoursesPage() {
  // 讲师选项与课程一起取：新增场次时要用，而它来自已有场次的去重，
  // 属于同一份数据的不同切面。
  const [courses, teachers] = await Promise.all([getCourses(), getTeachers()]);
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <CoursesClient courses={courses} teachers={teachers} />
    </main>
  );
}
