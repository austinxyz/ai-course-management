# homework-sync

把 `ai-course` 仓库的 `grades.csv` 同步进学员管理系统。

```bash
# dry-run（默认，只读）
python tools/homework-sync/sync.py --course S1 ~/projects/ai-course/tools/homework-grader/session1/grades.csv

# 真的写入
python tools/homework-sync/sync.py --course S1 <同上> --apply
```

需要两个环境变量：`BACKEND_URL`（默认 `http://127.0.0.1:8000`）与 `BACKEND_SECRET`。

**dry-run 也要连后端。** 它带 `?dry_run=true` 请求同一个接口，服务端算完整个处置结果
但不落库。这不是多余的往返：下面那两份清单的判据是「谁在学员表」「谁有该课的报课记录」——
只有数据库知道。纯本地的 dry-run 报不出实际会跳过谁，而那正是 dry-run 的全部意义。

## 为什么只能在本地跑

`grades.csv` 在**另一个仓库**里。部署环境的后端看不到那些文件，所以网页上不可能
有「重新同步」按钮 —— 稿子上画了一个，有意没做。

## `--course` 为什么必填

**不从目录名推断。** 源仓库的目录名已经错了一处：

| 文件 | 内容 | 实际属于 |
|---|---|---|
| `session3/grades.csv` + `submissions/` | 建站 · 海报 · PPT | S3 ✅ |
| `session3/references/rubric.md` | `/market-daily` Skill | **S4** ❌ |
| `session4/references/rubric.md` | Claude Design 建站 | **S3** ❌ |
| `session4/grades.csv` | 0 行，S3 的表头 | S3 的空壳 |

别名走 `course_aliases` 解析（与 `tools/course-import` 同一条路径），不区分大小写。
查不到就整份拒绝，一条都不写 —— 别名错了意味着整份文件都可能挂错课。

## 同步的语义

**幂等**：同一份文件跑几遍结果都一样，不会多出记录。唯一键是「学员 + 课程」——
一个人重复听同一门课会有多条报课，但只欠一份作业。

**覆盖式，不是同步式删除**：源文件里少了一行，库里那条仍然留着。csv 是会被裁剪、
被重新生成的，把"这次没送来"读成"该删掉"会让一次误操作抹掉历史成绩。

**总分原样存**，不由分项求和。`session2/grades.csv` 里真有一行对不上，
而镜像的职责是忠实，不是纠正。

同一人同一课在文件里出现两次时，取**提交时间较晚**的那一行；日期并列时取
文件里靠后的那一行。被丢掉的行会在报告里列出来。

## 报告里的两份清单

处置**相反**，所以分开列，不要合并看：

| 清单 | 含义 | 成绩写了吗 | 该做什么 |
|---|---|---|---|
| 不在学员表 | 邮箱在 `students` 里查不到 | **没写** | 先建学员，再重跑 |
| 无报课记录 | 学员在册，但这门课没有报课 | **写了** | 补报课记录 |

第二类要特别注意：成绩已经进库了，但作业页的名单来自**报课记录**，
所以这些人在页面上一行都不会出现。不补报课的话，页面计数会比 csv 的行数少，
而那是**正确行为**，不是缺陷。

## 测试

```bash
cd tools/homework-sync && python -m pytest
```

解析层（`parsing.py`）是纯函数，测试不碰文件也不碰网络。
`sync.py` 的测试用假 client 断言 dry-run **真的**一个请求都不发。

其中一条用只认 cp1252 的假 stdout 跑一遍报告：这个脚本的输出整个是中文，
直接 `print` 会在第一行的 `←` 就抛 `UnicodeEncodeError`。
pytest 捕获的是内存流，所以**本地全绿也照样在真终端里炸** —— 必须专门钉住。
