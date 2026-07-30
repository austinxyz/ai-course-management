-- 别名的匹配键必须是归一化形式（去首尾空白 + 转小写）。应用层已经这么做，
-- 这条约束是给绕过 API 的导入脚本兜底：没有它，脚本插入 `S1` 之后 `s1` 还能再插一行，
-- 两行指同一个逻辑别名，主键的唯一性就形同虚设。
-- 与 students_email_lower_key 同源——归一化的不变量要在库里也说一遍。
alter table course_aliases
  add constraint course_aliases_alias_normalized
  check (alias = lower(btrim(alias)));
