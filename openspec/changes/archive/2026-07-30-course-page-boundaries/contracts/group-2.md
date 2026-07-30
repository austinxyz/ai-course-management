### Contract
- **Spec**:
  - 课程页 SHALL 在数据获取期间呈现加载态，且该加载态 SHALL 明示可能出现的长时间等待。
  - 课程页 SHALL 在后端不可达时呈现可读的错误说明与重试入口，而非白屏或未捕获的异常。
    错误说明 SHALL 同时覆盖"服务正在唤醒"与"服务异常"两种可能。重试 SHALL 重新发起数据获取，
    而不仅是重新渲染既有内容。
  - 应用外壳之外发生的渲染错误，以及外壳自身抛出的错误，SHALL 由一层兜底错误界面接住，
    呈现中文说明与重试入口，而非框架默认的错误页。
- **Runtime**: `cd frontend && npm run test` → expected: 课程页 loading/error 的新测试通过
  （文案含等待说明、重试调用 `unstable_retry` 而非 `reset`），既有测试无回归；`npm run build` 通过
- **Code**:
  - 重试必须用 `unstable_retry()`，**不是 `reset()`** —— 后者只重渲染子树、不重新取数，
    点了会原地不动停在错误页，恰在"后端刚醒"这个最需要它的场景失效
  - `error.tsx` 组内共用一份（现有文案对任何数据页都成立）；`loading.tsx` 按路由各一份（文案分页面）
  - 卡片 DOM 不动，只改最外层容器：整屏居中 → 内容区内居中
  - 两层 error 分工：`(app)/error.tsx` 接组内页面错误（侧边栏在）；`app/error.tsx` 接
    `(app)/layout.tsx` 自身的错与组外页面（侧边栏不在）
- **Threshold**: 70
