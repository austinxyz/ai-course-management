import { Card, CardDescription, CardHeader, CardTitle } from "ai-course-frontend-ui";

export function Default() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Card>
        <CardHeader>
          <CardTitle>王晓明</CardTitle>
          <CardDescription>student@example.com</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
