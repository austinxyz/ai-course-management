import { PlaceholderPage } from "@/app/students/PlaceholderPage";
import { Sidebar } from "@/app/students/Sidebar";

/**
 * 报课 has no design yet. It owns a route anyway: the section it will
 * eventually hold should not have to be added to the roster component.
 */
export default function EnrollPage() {
  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-background">
      <Sidebar active="enroll" />
      <PlaceholderPage view="enroll" />
    </div>
  );
}
