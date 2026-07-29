### Contract
- **Spec**: 学员列表页由真实数据驱动（浏览器 → Next.js server-side fetch → FastAPI → 本地 Supabase）；点击列表行，详情面板显示该学员完整字段（只读）。
- **Runtime**: `cd frontend && npm run test` → expected: 新增 vitest 用例通过，`StudentsClient` 渲染的未对齐微信徽章类名命中 design token
- **Code**: design.md 决策 #7（Server Component 外壳 + Client Component 内核拆分，`frontend/lib/api.ts` 是 server-only 模块，不带 `NEXT_PUBLIC_` 前缀）
- **Threshold**: 70
