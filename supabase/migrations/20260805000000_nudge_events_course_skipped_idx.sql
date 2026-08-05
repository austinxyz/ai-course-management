-- `GET /api/nudge?course=` 的 skipped_count 查询按 (course_id, event_type) 过滤，
-- student_email 不是过滤条件——已有的 nudge_events_student_course_idx 领头列是
-- student_email，覆盖不到这次查询。加一个领头列匹配的索引。
create index nudge_events_course_type_idx on nudge_events (course_id, event_type);
