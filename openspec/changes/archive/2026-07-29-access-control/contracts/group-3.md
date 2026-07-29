### Contract
- **Spec**: N/A —— 基础设施组。本组产出的是环境变量模板与仓库级检查项，不构成对外行为契约；`access-control` 的 SHALL 由第 1、2 组覆盖。
- **Runtime**: `cd frontend && npm run test && cd ../backend && uv run pytest` → expected: 前后端测试均无回归（本组只改模板与配置，不应影响任何测试）
- **Code**: design.md 决策 #6 —— 前端密码与后端 secret 是两个不同变量；后端 secret 绝不可带 `NEXT_PUBLIC_` 前缀；`openspec/config.yaml` 现有泄露检查覆盖不到新变量名，必须扩充，否则误写成 `NEXT_PUBLIC_*` 时现有检查不会报警
- **Threshold**: 80
