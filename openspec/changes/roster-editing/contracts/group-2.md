### Contract
- **Spec**:
  - 系统 SHALL 支持更新已有学员的可编辑字段（**姓名**、…），更新 SHALL 落库并在页面刷新后依然存在。
  - 姓名 SHALL 在写入前去除首尾空白；去除后为空的姓名 SHALL 被拒绝。
- **Runtime**: `cd frontend && npm run test` → expected: 既有前端用例无回归，新增「姓名字段行可编辑」「保存失败保留输入」「改名后选中态仍是同一邮箱」三类断言通过
- **Code**:
  - 姓名走字段表既有渲染分支（就地编辑 / 保存中 / 失败保留输入），**不为姓名单开一套 UI**；详情面板顶部的姓名是展示位，编辑入口统一在字段表
  - `EditableFieldKey` 增 `"name"`；前后端字段名同为 `name`，无需 camel→snake 映射（对比 `wxName` → `wx_name`）
  - 列表按 `ORDER BY name, email`，改名会让该行移位；选中态以邮箱为键，必须有测试钉住"改名后选中的仍是同一封邮箱"，防止将来被改成按索引选中
- **Threshold**: 70
