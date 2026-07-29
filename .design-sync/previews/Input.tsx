import { Input } from "ai-course-frontend-ui";

export function Default() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Input placeholder="学员邮箱" />
    </div>
  );
}

export function Filled() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Input defaultValue="student@example.com" />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Input placeholder="学员邮箱" disabled />
    </div>
  );
}
