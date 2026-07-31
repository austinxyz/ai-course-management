import { getCourses, getEnrollments, getStudents } from "@/lib/api";
import { StudentsClient } from "./StudentsClient";

export default async function StudentsPage() {
  // Both halves are fetched up front so the 在读/已归档 toggle stays instant.
  // Two queries rather than one filtered client-side: the server decides what
  // "archived" means now, and the client no longer keeps its own list of
  // archived emails — which is what used to make that toggle disagree with
  // the database after a reload.
  // 报课与课程一起取：详情面板要列出报课，补录弹窗要选课程与场次。
  // 分成后续请求会让面板先渲染成"没有报课"再跳成有——那和真的没有分不出来。
  const [students, archivedStudents, enrollments, courses] = await Promise.all([
    getStudents(),
    getStudents({ archived: true }),
    getEnrollments(),
    getCourses(),
  ]);
  return (
    <StudentsClient
      students={students}
      archivedStudents={archivedStudents}
      enrollments={enrollments}
      courses={courses}
    />
  );
}
