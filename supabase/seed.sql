-- 本地开发种子数据 —— 虚构学员，仅供本地 supabase start / db reset 使用。
-- 不会被 `supabase db push` 推到线上项目。来源：frontend/app/students/mock-data.ts

insert into students (email, name, wechat, wx_name, nick, region, level, source, tags, note, gender, age, industry) values
('chen.jiahe@example.com', '陈嘉禾', 'wx_chenjh', 'Jiahe Chen', '嘉禾 🌱', '美西', '有基础', '讲武堂', '["活跃"]'::jsonb, '第 2 期老学员，主动帮同学答疑。', '女', '30-35', '互联网 · 运营'),
('lin.min@example.com', '林敏', '', 'Min Lin', '敏敏', '美西', '小白', '理财群', '["新报名"]'::jsonb, '报课表里手机号填的是美国号，微信待人工确认。', '女', '25-30', '留学 · 在读'),
('zhao.ziqian@example.com', '赵子谦', 'zzq_dev', '谦', '子谦', '美东', '工程师', '股票群', '["小组长", "活跃"]'::jsonb, '后端 6 年，作业提交很快，可考虑当助教。', '男', '30-35', '互联网 · 后端'),
('wu.jing@example.com', '吴静', 'wujing_2024', 'Jing', '静静', '美东', '有基础', '讲武堂', '["作业优秀"]'::jsonb, '', '女', '35-40', '金融 · 数据'),
('he.wei@example.com', '何伟', '', '伟', '阿伟', '其他地区', '会电脑', '加拿大', '["时区冲突"]'::jsonb, '两次作业未交，群里也没找到人，先补微信。', '男', '40-45', '制造 · 管理'),
('su.wan@example.com', '苏晚', 'suwan_ing', '晚晚', '晚安', '美西', '会电脑', '理财群', '["活跃"]'::jsonb, '产品经理，问题都问在点子上。', '女', '28-32', '互联网 · 产品'),
('zheng.kai@example.com', '郑凯', 'zk_88', 'Kai Z', 'K', '美东', '工程师', 'Andrew纽约', '[]'::jsonb, '', '男', '30-35', '云服务 · 平台'),
('huang.li@example.com', '黄丽', '', 'Lily H', 'Lily', '其他地区', '小白', '其他', '["新报名", "时区冲突"]'::jsonb, '只能参加晚场直播，需要单独发回放。', '女', '25-30', '跨境电商 · 运营'),
('sun.bo@example.com', '孙博', 'sunbo_ai', 'sunbo', '博', '加拿大', '有基础', '股票群', '["小组长", "作业优秀"]'::jsonb, '作业质量稳定，可作为案例展示（已口头同意）。', '男', '32-38', '医疗 · 研发'),
('ma.ruo@example.com', '马若', 'maruo0', '若若', '若', '美东', '会电脑', '加拿大', '["新报名"]'::jsonb, '设计背景，代码部分需要多带一下。', '女', '26-30', '品牌设计 · 自由职业');
