import { getEnrollments, getStudents } from "@/lib/api";
import { EnrollClient } from "./EnrollClient";

export default async function EnrollPage() {
  // 姓名在学员那边，报课只带邮箱。两份一起取：分成后续请求会让表格先渲染成
  // 一列"—"再跳成姓名，而"还没到"与"这个人不在名单里"分不出来。
  //
  // 已归档的也要取：他们的报课记录仍在册（归档不影响报课），
  // 只列在读的话这些行会显示不出姓名。
  const [enrollments, students, archived] = await Promise.all([
    getEnrollments(),
    getStudents(),
    getStudents({ archived: true }),
  ]);
  const namesByEmail = Object.fromEntries(
    [...students, ...archived].map((s) => [s.email, s.name]),
  );
  return <EnrollClient enrollments={enrollments} namesByEmail={namesByEmail} />;
}
