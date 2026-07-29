import { Badge } from "ai-course-frontend-ui";

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge>在读</Badge>
      <Badge variant="success">已交作业</Badge>
      <Badge variant="danger">未交作业</Badge>
      <Badge variant="muted">S4</Badge>
    </div>
  );
}
