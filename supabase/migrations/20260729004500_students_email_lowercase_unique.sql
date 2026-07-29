-- 邮箱是跨系统（EliteCoach101 报课、grades.csv 作业）的唯一 join key。
-- 主键是大小写敏感的 text，因此 Foo@x.com 与 foo@x.com 是两行 —— 同一个人两个 key，
-- join 会静默漏人。应用层已在写入时转小写；这条索引是数据库层的兜底，
-- 防止将来任何绕过 API 的导入脚本重新引入大小写重复。
create unique index students_email_lower_key on students (lower(email));
