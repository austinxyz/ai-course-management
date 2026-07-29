import { Badge, Card, CardDescription, CardHeader, CardTitle } from "ai-course-frontend-ui";

export function StudentCard() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Card>
        <CardHeader>
          <CardTitle>王晓明</CardTitle>
          <CardDescription>student@example.com</CardDescription>
        </CardHeader>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge variant="muted">S4</Badge>
          <Badge variant="success">在读</Badge>
        </div>
      </Card>
    </div>
  );
}

export function Plain() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Card>
        <p style={{ margin: 0, fontSize: 14 }}>暂无学员，去导入报课数据。</p>
      </Card>
    </div>
  );
}
