# 课程导入（一次性）

把 [course-portal](https://austinxyz.github.io/course-portal/) 上的四门课导入系统。
设计见 [docs/superpowers/specs/2026-07-30-course-import-design.md](../../docs/superpowers/specs/2026-07-30-course-import-design.md)。

## 用法

```bash
export BACKEND_URL=https://<service>.onrender.com
export BACKEND_SECRET=<Render 上那个值>

python tools/course-import/import_courses.py          # dry-run，只读
python tools/course-import/import_courses.py --apply  # 唯一会写的路径
```

## 语义

- **匹配靠别名，不靠课程名。** 课程名会改（改名时界面会提示同步别名），别名才是稳定指向。
  副作用正是要的：生产上那条内容是占位、但握着别名 `S1` 的记录会被**就地改造**成真的 S1，
  不新建、不删除（课程本来也没有删除入口）。
- **重跑安全。** 别名按归一化值去重，场次按 `日期 + 时间 + 时区` 去重。
- **脚本不删任何东西。** 库里有、清单里没有的场次只会被列出来（`! 库里多出一场`），
  删除由人在界面上做 —— 删除是决定，不交给批处理。
- 价格与组合价不导（`docs/requirements.md` §2：不做支付/对账）。

## 数据

`courses.json` 是从门户**人工转录**的公开课程信息，不含任何学员数据，因此进仓库。
不写解析器：四门课，解析器的成本高于收益，而且它会在门户改版时静默失效。

场次的讲师统一填 `Austin Xu`（门户上没有逐场讲师），时间 20:30 美东，之后可逐场改。

## 测试

```bash
python -m pytest tools/course-import
```

`planning.py` 是纯函数（不发请求、不读环境变量），因为"哪门课挂到哪几场"是这件事里
最容易错位、也最难事后发现的部分。驱动脚本另有一条测试盯着 **dry-run 不发任何写请求**。
