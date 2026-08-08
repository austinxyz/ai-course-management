import { getInteractions } from "@/lib/api";
import { InteractionsClient } from "./InteractionsClient";

/**
 * 互动记录页。全量拉取一次，筛选全部在客户端（`interactions` design.md 决定 1）。
 * `?student=` 支持从 `nudge` 页深链接过来，预筛选为某个学员（design.md 决定 5）。
 */
export default async function InteractionsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  const interactions = await getInteractions();

  return <InteractionsClient interactions={interactions} initialStudent={student} />;
}
