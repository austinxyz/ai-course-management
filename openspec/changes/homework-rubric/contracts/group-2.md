### Contract
- **Spec**: 系统 SHALL 在课程页提供一处入口，讲师可以给某门课的各个分项录入满分（正整数）。分项名字 SHALL 由系统自动列出，SHALL NOT 要求讲师手工输入分项名。满分 SHALL 允许为空，已配置的 SHALL 拒绝非正整数。（`specs/homework/spec.md`「讲师可以在课程页维护各分项满分」）
- **Runtime**: `cd frontend && npm run test -- RubricEditor` → expected: 全部通过，新增用例覆盖分项自动列出、保存、留空不阻塞、拒绝非正整数的错误提示
- **Code**: mock 稿 `docs/superpowers/specs/mocks/2026-08-02-homework-rubric-mocks.html#course-page-rubric-editor`——分项名列表 + 每项一个数字输入框，未配置的用 placeholder「未配置」；保存走整表提交（对应后端 `PUT /api/homework/rubric`）；`lib/api.ts` 里的 rubric 相关函数跟随 `courses/` 现有约定（字段名不做 snake→camel 映射，直接透传后端形状，与 `getCourses`/`updateCourse` 同一套风格）；`actions.ts` 里的 `getRubricAction`/`saveRubricAction` 跟随既有 `requireSitePassword` + `ActionResult` 模式
- **Threshold**: 70
