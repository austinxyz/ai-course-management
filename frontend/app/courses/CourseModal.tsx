"use client";

import { Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ZONE_ROWS } from "@/lib/tz";
import type { Course } from "./types";

export interface CourseForm {
  name: string;
  short: string;
  tagline: string;
  intro: string;
  duration_minutes: number;
  homework_title: string;
  offline: boolean;
  default_tz: string;
}

export const BLANK_COURSE: CourseForm = {
  name: "",
  short: "",
  tagline: "",
  intro: "",
  duration_minutes: 120,
  homework_title: "",
  offline: false,
  default_tz: "America/Los_Angeles",
};

export function formFrom(course: Course): CourseForm {
  const { name, short, tagline, intro, duration_minutes, homework_title, offline, default_tz } =
    course;
  return { name, short, tagline, intro, duration_minutes, homework_title, offline, default_tz };
}

interface CourseModalProps {
  /** 编辑时带上原课程，用于别名区块与「改名要同步别名」提示。 */
  course: Course | null;
  form: CourseForm;
  onChange: (form: CourseForm) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  aliasDraft: string;
  onAliasDraft: (value: string) => void;
  onAddAlias: () => void;
  onRemoveAlias: (raw: string) => void;
  aliasError: string | null;
}

function chip(active: boolean): string {
  return cn(
    "inline-flex h-[26px] items-center rounded-token border px-2.5 font-sans text-[12px]",
    active
      ? "border-primary bg-primary font-medium text-primary-foreground"
      : "border-border bg-surface text-foreground",
  );
}

export function CourseModal(props: CourseModalProps) {
  const {
    course, form, onChange, onClose, onSave, saving, error,
    aliasDraft, onAliasDraft, onAddAlias, onRemoveAlias, aliasError,
  } = props;
  const editing = course !== null;

  const set = <K extends keyof CourseForm>(key: K, value: CourseForm[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/30 p-8">
      {/* role="dialog"：背后的详情面板显示着同样的别名与课程名，
          没有这个边界，读屏与测试都分不清"面板上的 S1"和"弹窗里的 S1"。 */}
      <div
        role="dialog"
        aria-label={editing ? "编辑课程" : "新建课程"}
        className="flex w-[620px] flex-col gap-3.5 rounded-token border border-border bg-surface p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-sans text-[17px] font-semibold">
            {editing ? "编辑课程" : "新建课程"}
          </h2>
          <p className="m-0 font-sans text-[12.5px] leading-relaxed text-muted">
            {editing
              ? "课程名改了要同步平台别名，否则下次导入会匹配不上。"
              : "先把课建出来：名称、定位、作业。场次和讲师创建后在课程页排，同一门课可以多场、不同讲师。"}
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">
            课程名 <span className="text-danger">*</span>
          </span>
          <Input
            value={form.name}
            placeholder="如 Claude 实战入门"
            onChange={(e) => set("name", e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">简称</span>
          <Input value={form.short} placeholder="入门" onChange={(e) => set("short", e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">
            一句话定位 <span className="font-sans text-muted-foreground/80">列表和卡片上显示</span>
          </span>
          <textarea
            rows={2}
            value={form.tagline}
            placeholder="讲给谁、一次课解决什么问题"
            onChange={(e) => set("tagline", e.target.value)}
            className="rounded-token border border-border bg-surface px-2.5 py-1.5 font-sans text-[12.5px]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">
            课程介绍 <span className="font-sans text-muted-foreground/80">招生和答疑时用的完整说明</span>
          </span>
          <textarea
            rows={5}
            value={form.intro}
            placeholder="这门课怎么上、上完能做到什么、对学员有什么要求…"
            onChange={(e) => set("intro", e.target.value)}
            className="rounded-token border border-border bg-surface px-2.5 py-1.5 font-sans text-[12.5px]"
          />
        </label>

        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="font-mono text-[11px] text-muted-foreground">默认上课设置</span>
          <label className="flex flex-col gap-1">
            {/* 输入框而非 chip：chip 一旦不够用就退化成"选个最接近的"，
                而那正是这次要修的毛病——四门真实课程都是 150 分钟。 */}
            <span className="font-sans text-[12px] text-foreground">
              每场时长 <span className="text-muted-foreground">分钟 · 默认时区可在下方设定</span>
            </span>
            <Input
              type="number"
              value={String(form.duration_minutes)}
              onChange={(e) => set("duration_minutes", Number(e.target.value))}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="font-sans text-[12px] text-foreground">
              默认时区{" "}
              <span className="text-muted-foreground">新增场次时预选它，不影响已排好的场次</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ZONE_ROWS.map((zone) => (
                <button
                  key={zone.timeZone}
                  type="button"
                  onClick={() => set("default_tz", zone.timeZone)}
                  className={chip(form.default_tz === zone.timeZone)}
                >
                  {zone.label}
                </button>
              ))}
            </div>
          </div>
          <p className="m-0 font-sans text-[11.5px] leading-relaxed text-muted-foreground">
            讲师是按场次定的：在课程页「上课时间」里点某一场的「改这一场 / 修正」改讲师。这里只管全课默认时区和时长。
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">
            作业题目 <span className="font-sans text-muted-foreground/80">一次 · 截止日期按场次定</span>
          </span>
          <Input
            value={form.homework_title}
            placeholder="用 Claude 完成一件自己的真实工作"
            onChange={(e) => set("homework_title", e.target.value)}
          />
        </label>

        {editing && (
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              平台别名 <span className="font-sans text-muted-foreground/80">导入时按这些写法匹配</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {course.aliases.map((alias) => (
                <span
                  key={alias.raw}
                  className="inline-flex items-center gap-1.5 rounded-token border border-border bg-surface-muted px-2 py-0.5 font-mono text-[11.5px]"
                >
                  {alias.raw}
                  <button
                    type="button"
                    aria-label={`删除别名 ${alias.raw}`}
                    disabled={saving}
                    onClick={() => onRemoveAlias(alias.raw)}
                    className="border-0 bg-transparent font-sans text-[12px] text-muted-foreground"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={aliasDraft}
                placeholder="平台里的另一种写法"
                onChange={(e) => onAliasDraft(e.target.value)}
              />
              {/* flex-none + nowrap：输入框会把按钮压到"添加别 / 名"两行。
                  disabled：busy 是全页共享的，连点会把同一个别名发两遍、第二次撞主键。 */}
              <Button
                variant="secondary"
                className="flex-none whitespace-nowrap"
                disabled={saving}
                onClick={onAddAlias}
              >
                添加别名
              </Button>
            </div>
            {aliasError && (
              <span className="font-sans text-[11.5px] text-danger">{aliasError}</span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="font-mono text-[11px] text-muted-foreground">上架状态</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => set("offline", false)} className={chip(!form.offline)}>
              上架
            </button>
            <button type="button" onClick={() => set("offline", true)} className={chip(form.offline)}>
              已下线
            </button>
            {form.offline && <Badge variant="muted">已下线</Badge>}
          </div>
          <span className="font-sans text-[11.5px] text-muted-foreground">
            待开课 / 已上课 由上课日期自动判断，这里只管上下架。
          </span>
        </div>

        {error && <span className="font-sans text-[12px] text-danger">{error}</span>}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="font-sans text-[11.5px] text-muted-foreground">
            已有报课不会因为改课程信息而变动
          </span>
          <div className="flex gap-2">
            {/* 保存中禁用：弹窗一关，随后回来的失败信息就没有地方渲染 ——
                与"提交即关窗"是同一个失败，只是从另一个出口漏出来。 */}
            <Button variant="secondary" disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" onClick={onSave} disabled={saving}>
              {editing ? "保存课程" : "创建课程"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
