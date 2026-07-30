import { getCourses, getTeachers } from "@/lib/api";
import { Sidebar } from "@/app/students/Sidebar";
import { CoursesClient } from "./CoursesClient";

export default async function CoursesPage() {
  // 讲师选项与课程一起取：新增场次时要用，而它来自已有场次的去重，
  // 属于同一份数据的不同切面。
  const [courses, teachers] = await Promise.all([getCourses(), getTeachers()]);
  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-background">
      <Sidebar active="courses" />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CoursesClient courses={courses} teachers={teachers} />
      </main>
    </div>
  );
}
