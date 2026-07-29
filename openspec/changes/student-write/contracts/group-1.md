### Contract
- **Spec**: 系统 SHALL 支持更新已有学员的可编辑字段，更新 SHALL 落库；邮箱 SHALL NOT 可被修改。后端 SHALL 校验写请求中区域、基础、来源三个字段的取值落在既定枚举内，非法值 SHALL 被拒绝；该校验 SHALL 只作用于请求体，不得施加于读取响应。系统 SHALL 支持新增学员。系统 SHALL 支持将学员归档与恢复；归档是软删除，记录及其关联数据 SHALL 保留；归档时间 SHALL 由服务端记录，SHALL NOT 由客户端提供。
- **Runtime**: `cd backend && uv run pytest tests/test_students_write.py -v` → expected: 全部通过，覆盖 部分字段更新、拒绝改邮箱、非法枚举被拒、清空备注与不改备注可区分、新增、邮箱冲突（在读/已归档各一）、归档、恢复、归档时间由服务端盖
- **Code**: design.md 决策 #3（归档走独立端点，字段更新端点不接受归档字段）、#4（`archived_at` 可空，既有行为 null，否则无法迁移）、#5（`Literal` 只用于请求体，读响应仍用 `str`——读响应用 `Literal` 会因一行脏数据整个接口 500）、#6（部分更新必须区分"未提供"与"显式设为空"，否则清空备注会失效）
- **Threshold**: 80
