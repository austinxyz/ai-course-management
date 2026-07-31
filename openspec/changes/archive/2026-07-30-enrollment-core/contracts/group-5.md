### Contract
- **Spec**:
  - 有人报名的场次 SHALL 显示其已报人数；无人报名时 SHALL 不显示该数字。
    课程 SHALL 另外呈现"未定场次"的人数，为零时 SHALL 不显示。
  - 删除有报课的场次 SHALL 被拒绝，界面 SHALL 说明有多少条报课挡着。
- **Runtime**: `cd frontend && npm run test` → expected: 人数显示三态（有人/无人/未定场次）
  与删除被拒的错误呈现通过，既有测试无回归；`npm run build` 通过
- **Code**:
  - **错误必须渲染在触发它的那一行**（场次行内），不能塞进课程弹窗的 state ——
    行内删除时弹窗是关着的，塞进去等于什么都不显示（`course-catalog` group 6 被 BLOCK 两次的形状）
  - 错误状态按**场次 id** 分开存
  - 零值不显示：无人报名的场次不出现数字，未定场次为零不出现提示
- **Threshold**: 70
