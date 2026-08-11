import { getEnrollments, getInteractions, getStudents } from "@/lib/api";
import { createInteractionAction, deleteInteractionAction } from "./actions";
import { InteractionsClient } from "./InteractionsClient";

/**
 * 互动记录页。全量拉取一次，筛选全部在客户端（`interactions` design.md 决定 1）。
 * `?student=` 支持从 `nudge` 页深链接过来，预填搜索框（`interactions-design-alignment`
 * design.md 决定 8——原来预选中的学员下拉已经不存在，改填搜索框）。
 * 学员/报课列表是"记一条"面板选学员、判断有没有有效报课要用的，跟
 * `students/page.tsx` 拉同一份数据（design.md 决定 4）。
 */
export default async function InteractionsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  const [interactions, students, enrollments] = await Promise.all([
    getInteractions(),
    getStudents(),
    getEnrollments(),
  ]);

  return (
    <InteractionsClient
      interactions={interactions}
      students={students.map((s) => ({ email: s.email, name: s.name }))}
      enrollments={enrollments.map((e) => ({ studentEmail: e.studentEmail, state: e.state }))}
      initialQuery={student}
      onCreateInteraction={createInteractionAction}
      onDeleteInteraction={deleteInteractionAction}
    />
  );
}
