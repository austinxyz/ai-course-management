### Contract
- **Spec**:
  - 报课 SHALL 记录报名日期与来源。来源 SHALL 有三种（`manual` / `platform` / `derived`），
    且它们的区别对将来的平台导入具有约束力：平台导入 SHALL NOT 覆盖 `manual`，
    SHALL 可以覆盖 `derived`。
  - 界面补录的记录 SHALL 标为 `manual`；由既有记录倒推建立的 SHALL 标为 `derived`。
  - 写入请求给出三种之外的来源值时 SHALL 被拒绝。
- **Runtime**: `cd backend && uv run pytest tests/test_enrollments_api.py -q` → expected:
  默认 `manual`、可指定 `derived`、第四种值被拒三条断言通过；既有报课测试无回归
- **Code**:
  - **无 schema 变更** —— `source` 已是 `text` 且没有 CHECK 约束（与 `region`/`level` 同一判断）
  - 取值只在 API 边界挡；**只读响应仍用 `str` 而非 `Literal`** ——
    枚举外的值会让整个列表接口 500 而不是那一行出错
  - 覆盖规则本身不实现（平台导入不存在），只把值与语义定下来
- **Threshold**: 80
