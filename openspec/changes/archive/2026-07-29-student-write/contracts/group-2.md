# Contract — Group 2: Server Actions + 写入面鉴权

- **Spec**: 每个写入入口 SHALL 独立校验凭据，SHALL NOT 仅依赖页面层的访问控制。未携带有效凭据的写请求 SHALL 被拒绝且 SHALL NOT 改变任何数据。
- **Runtime**: `cd frontend && npm run test` → expected: 全部 vitest 通过，含 无凭据调用 Action 被拒、有凭据放行、Action 调后端时带上 `X-Backend-Secret` 三组断言
- **Code**: design.md 决策 #2 —— 凭据比对逻辑与 `proxy.ts` **共用同一个函数**，避免两处实现漂移；Server Action 内通过 `headers()` 读 `Authorization`。**双向风险**：matcher 没覆盖 Action 的 POST 且 Action 内不校验 → 写入面裸奔；浏览器不在 Action 请求上带凭据 → 所有写操作全挂。两个方向都必须实测排除
- **Threshold**: 80
