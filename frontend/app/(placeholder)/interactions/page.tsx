import { PlaceholderPage } from "@/app/students/PlaceholderPage";
import { Sidebar } from "@/app/students/Sidebar";

/**
 * 互动记录 has no design yet. It owns a route anyway: the section it will
 * eventually hold should not have to be added to the roster component.
 */
export default function InteractionsPage() {
  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-background">
      <Sidebar active="interactions" />
      <PlaceholderPage view="interactions" />
    </div>
  );
}
