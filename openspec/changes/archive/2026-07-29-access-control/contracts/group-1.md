### Contract
- **Spec**: 后端 SHALL 校验共享 secret header，默认覆盖所有路由；未携带或携带错误 secret 的请求 SHALL 被拒绝。后端在生产环境 SHALL NOT 提供 `/docs` 与 `/openapi.json`。当认证所需的环境变量缺失时，系统 SHALL 拒绝全部请求，SHALL NOT 放行。
- **Runtime**: `cd backend && uv run pytest tests/test_access_control.py -v` → expected: 全部通过，覆盖 无 secret→401、错 secret→401、对 secret→200、secret 变量缺失→拒绝、docs 默认关闭 五种情形
- **Code**: design.md 决策 #4（校验放 FastAPI middleware 而非 router 依赖——新增路由自动受保护；用 `secrets.compare_digest` 常数时间比较）、决策 #5（文档开关做成"默认关、显式开"，靠 `ENABLE_API_DOCS` 显式启用，而不是判断"是否生产"）、决策 #3 的 fail-closed 形状（先判缺失、再比对，不可合并成一个条件表达式）
- **Threshold**: 80
