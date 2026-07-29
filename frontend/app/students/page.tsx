import { getStudents } from "@/lib/api";
import { StudentsClient } from "./StudentsClient";

export default async function StudentsPage() {
  const students = await getStudents();
  return <StudentsClient students={students} />;
}
