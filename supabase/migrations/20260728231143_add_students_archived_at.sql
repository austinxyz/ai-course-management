-- 归档是软删除：记录留着，只是不再进入在读名单。
-- 存时间戳而非布尔值 —— 多记"何时归档"成本近乎为零，而结课/退课时间以后大概率有用。
-- 必须可空：null 表示在读，既有行因此无需回填。
alter table students add column archived_at timestamptz;
