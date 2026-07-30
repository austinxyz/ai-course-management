-- 两件事：时长改用分钟，课程记住默认时区。
--
-- 起因：真实课程是 150 分钟、排在美东。原来的 hours int（限 1–4 的整小时）
-- 存不下 2.5 小时，而"按美西记"是写死在 schema 默认值与界面文案里的。
-- 两处都是照设计稿的示例值做的，不是照真实数据做的。
--
-- 回滚（人工，本项目无 down migration，且**有损**——150 会变成 2 或 3，
-- 回滚前须确认库里没有非整小时的数据）：
--   alter table courses add column hours int not null default 2;
--   update courses set hours = greatest(1, round(duration_minutes / 60.0));
--   alter table courses drop column duration_minutes, drop column default_tz;

alter table courses add column duration_minutes int not null default 120;

-- 回填而不是直接吃默认值：migration 要能在任何一份数据上正确重放，
-- 不只是当前生产上那一条。
update courses set duration_minutes = hours * 60;

alter table courses drop column hours;

-- 新增场次时的预选时区。**只影响将来**——改这个值不回溯已有场次，
-- 否则改一个叫"默认"的字段就会静默改写"六月那场到底几点上的"。
-- DB 默认留美西（与场次默认一致的中立值），不把某个用户的排课习惯写进 schema。
alter table courses add column default_tz text not null default 'America/Los_Angeles';
