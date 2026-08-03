## ADDED Requirements

### Requirement: 讲师可以为一条提交上传批改报告，解析出逐分项评语与整体评语

系统 SHALL 允许讲师在提交详情面板为**当前选中的提交**上传一份批改报告文件
（`.md`）。上传按内容判定，不按扩展名，且 SHALL 有体积上限。

上传后 SHALL 先展示预览屏，SHALL NOT 直接写入。预览屏 SHALL 展示解析出的
逐分项评语（每条带勾选框，默认全部勾选）、整体的亮点、改进建议。

预览屏解析出的分项得分或总分与该提交现有的 `scores`/`total` 不一致时，
该分项行 SHALL 高亮警告；警告 SHALL NOT 阻止确认导入。

讲师确认导入时：SHALL 只写入勾选了的那些分项评语（未勾选的不写入，不影响
其余分项）；亮点、改进建议 SHALL 覆盖该提交当前的 `highlight`、`improve`
（这两者不单独勾选，跟随整体确认动作一起生效或一起不生效）。

系统 SHALL NOT 解析、SHALL NOT 存储报告中的「讲师回复草稿」与「作业原文」段落。

分项对齐 SHALL 只取编号前缀（如 `A1`）匹配已有 `scores` 里的 `item`，
SHALL NOT 要求分项标题文字完全一致。

理由：批改工具的详细报告目前只存在于另一个仓库，逐分项评语比 `grades.csv`
导入的精简版 `highlight`/`improve` 更细致，值得在系统里直接看到。分项对齐
只取编号前缀是因为报告里的表格写法（如「A1 工作流结构」，有空格）与
`grades.csv` 解析出的 `item` 键（如「A1工作流结构」，无空格）格式不同，
但两者的编号本身是一致的。

#### Scenario: 上传后先预览，不直接写入
- **WHEN** 讲师为某条已交的提交上传一份批改报告
- **THEN** 系统展示解析出的逐分项评语与整体评语，但不写入任何数据

#### Scenario: 分项评语按勾选写入
- **WHEN** 讲师在预览屏取消勾选其中一项分项评语，然后确认导入
- **THEN** 被取消勾选的那一项评语不写入，其余勾选的分项评语正常写入

#### Scenario: 得分不一致时警告但不阻止
- **WHEN** 解析出的某分项得分与该提交现有 `scores` 中对应分项不一致
- **THEN** 预览屏该分项行显示警告，确认导入按钮仍然可用

#### Scenario: 分项编号前缀匹配，忽略标题文字差异
- **WHEN** 报告表格中的分项写作「A1 工作流结构」，现有 `scores` 中的 item 键是
  「A1工作流结构」
- **THEN** 两者被识别为同一个分项，评语正确对应写入

#### Scenario: 讲师回复草稿与作业原文不被解析
- **WHEN** 上传的报告包含「讲师回复草稿」与「作业原文」两个段落
- **THEN** 预览屏与写入结果均不包含这两段内容

### Requirement: 来自批改报告的亮点与改进建议不受重新导入覆盖

某条提交的 `highlight`、`improve` 一旦被批改报告导入覆盖过，之后重新导入这门课的
`grades.csv` SHALL NOT 再覆盖这两个字段；`grades.csv` 里的其余字段（`total`、
`scores`、`reply_status`、`source_ref` 等）SHALL 正常按整行覆盖更新。

没有上传过批改报告的提交不受影响，重新导入 `grades.csv` SHALL 照常更新其
`highlight`/`improve`。

理由：`grades.csv` 的 `highlight`/`improve` 是精简版，批改报告是更细致的版本；
重新导入如果把细致版本冲掉，会让讲师白传一次报告。

#### Scenario: 上传过报告的提交，重新导入不覆盖
- **WHEN** 某条提交的 `highlight`/`improve` 已被批改报告导入覆盖过，随后这门课
  重新导入了一份 `grades.csv`（该学员那一行的亮点/改进建议列与报告不同）
- **THEN** 该提交的 `highlight`/`improve` 仍是报告导入时写入的版本，不受这次
  `grades.csv` 导入影响；`total`、`scores` 等其余字段正常更新

#### Scenario: 未上传过报告的提交，重新导入照常覆盖
- **WHEN** 某条提交从未上传过批改报告，这门课重新导入了 `grades.csv`
- **THEN** 该提交的 `highlight`/`improve` 按 `grades.csv` 这次的值正常更新
