import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">学员管理系统</h1>
      <p className="text-sm text-muted">
        项目脚手架已就绪，功能页面待 opsx 各 change 逐步实现。
      </p>
      <div className="flex gap-4">
        <Link
          href="/students"
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          学员名单 →
        </Link>
        <Link
          href="/style-guide"
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Design System Style Guide →
        </Link>
      </div>
    </main>
  );
}
