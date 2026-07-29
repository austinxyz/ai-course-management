### Contract
- **Spec**: 学员表的邮箱列 SHALL 有唯一约束；系统 SHALL 拒绝重复邮箱的写入（约束在 schema 层生效，即便本 change 未开放写接口）。
- **Runtime**: `cd backend && pytest` → expected: 新增的唯一性测试通过，无 import/连接错误
- **Code**: design.md 决策 #1（邮箱作为字面主键，不设代理 id）、#2（TEXT 列 + Pydantic Literal，不用 DB CHECK 约束）、#3（NOT NULL DEFAULT，不用 NULL）
- **Threshold**: 80
