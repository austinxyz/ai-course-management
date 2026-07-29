import { getStudents } from "@/lib/api";
import { StudentsClient } from "./StudentsClient";

export default async function StudentsPage() {
  // Both halves are fetched up front so the 在读/已归档 toggle stays instant.
  // Two queries rather than one filtered client-side: the server decides what
  // "archived" means now, and the client no longer keeps its own list of
  // archived emails — which is what used to make that toggle disagree with
  // the database after a reload.
  const [students, archivedStudents] = await Promise.all([
    getStudents(),
    getStudents({ archived: true }),
  ]);
  return <StudentsClient students={students} archivedStudents={archivedStudents} />;
}
