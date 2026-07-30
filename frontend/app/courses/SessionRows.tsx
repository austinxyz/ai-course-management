"use client";

import { useEffect, useState } from "react";

import { Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ZONE_ROWS, timeIn, weekdayIn, zoneLine } from "@/lib/tz";
import type { Course, CourseSession, SessionState } from "./types";

/**
 * 状态配色取自设计脚本：「待上」是 success 而非灰。
 * 这一列里真正要被看见的是"还没上、别忘了"。
 */
const STATE_LABEL: Record<SessionState, { text: string; variant: "success" | "muted" | "danger" }> = {
  pending: { text: "待上", variant: "success" },
  done: { text: "已上", variant: "muted" },
  cancelled: { text: "已取消", variant: "danger" },
};

const STATES: SessionState[] = ["pending", "done", "cancelled"];

/** 时区标签用界面上的短名（美东），存的是 IANA 名（America/New_York）。 */
function zoneLabel(timeZone: string): string {
  return ZONE_ROWS.find((z) => z.timeZone === timeZone)?.label ?? timeZone;
}

function ZonePicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (timeZone: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[11px] text-muted-foreground">时区</span>
      <div className="flex flex-wrap gap-1.5">
        {/* 与场次卡片下方那几行换算共用 ZONE_ROWS —— 两份清单会漂移成
            "能选、但换算行里不显示这个时区"。 */}
        {ZONE_ROWS.map((zone) => (
          <button
            key={zone.timeZone}
            type="button"
            onClick={() => onPick(zone.timeZone)}
            className={chip(zone.timeZone === value)}
          >
            {zone.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function chip(active: boolean): string {
  return cn(
    "inline-flex h-[24px] items-center rounded-token border px-2 font-sans text-[11.5px]",
    active
      ? "border-primary bg-primary font-medium text-primary-foreground"
      : "border-border bg-surface text-foreground",
  );
}

interface SessionRowsProps {
  course: Course;
  teachers: string[];
  onSave: (sessionId: string, patch: Record<string, string>) => void;
  onDelete: (sessionId: string) => void;
  onFollowDate: (sessionId: string) => void;
  onAdd: (body: Record<string, string>) => void;
  busy: boolean;
  /**
   * 按场次 id 存的失败信息，`new` 是新增表单那一条。
   *
   * 就近显示，不走课程弹窗那条通道：行内编辑时弹窗关着，
   * 而"看着像存上了、其实没存"是这套界面最不该有的失败方式。
   */
  errors: Record<string, string>;
  /** 新增成功的计数。变化即表示刚存上了一条，表单该收起。 */
  added: number;
}

export function SessionRows({
  course, teachers, onSave, onDelete, onFollowDate, onAdd, busy, errors, added,
}: SessionRowsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // 只在成功后收起。提交即关掉的话，失败信息会跟着表单一起消失，
  // 而那正是最需要它留下来的时候。
  useEffect(() => {
    setAdding(false);
  }, [added]);

  return (
    <div className="mt-3 flex flex-col gap-2">
      {course.sessions.length === 0 ? (
        <p className="m-0 font-sans text-[12.5px] leading-relaxed text-muted">
          还没有排课。加一个上课时间后，这门课才会出现在报课的场次选项里。
        </p>
      ) : (
        course.sessions.map((session, index) => (
          <SessionRow
            key={session.id}
            session={session}
            index={index}
            teachers={teachers}
            editing={editingId === session.id}
            onToggleEdit={() => setEditingId(editingId === session.id ? null : session.id)}
            onSave={(patch) => onSave(session.id, patch)}
            onDelete={() => onDelete(session.id)}
            onFollowDate={() => onFollowDate(session.id)}
            busy={busy}
            error={errors[session.id] ?? null}
          />
        ))
      )}

      {adding ? (
        <AddSession
          teachers={teachers}
          onCancel={() => setAdding(false)}
          onAdd={(body) => onAdd(body)}
          busy={busy}
          error={errors.new ?? null}
          defaultTz={course.default_tz}
        />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            + 添加上课时间
          </Button>
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session, index, teachers, editing, onToggleEdit, onSave, onDelete, onFollowDate, busy, error,
}: {
  session: CourseSession;
  index: number;
  teachers: string[];
  editing: boolean;
  onToggleEdit: () => void;
  onSave: (patch: Record<string, string>) => void;
  onDelete: () => void;
  onFollowDate: () => void;
  busy: boolean;
  error: string | null;
}) {
  const state = STATE_LABEL[session.state];
  const base = session.tz;
  const past = session.state === "done";
  const [draft, setDraft] = useState({
    local_date: session.local_date,
    local_time: session.local_time.slice(0, 5),
    // 这一场自己的时区，不是课程默认——取错的话，打开一个美西的旧场次再保存
    // 就把它静默改成了课程默认，时间看着没变、实际差三小时。
    tz: session.tz,
    teacher: session.teacher,
    note: session.note,
  });

  return (
    <div
      data-session={session.id}
      className="flex flex-col gap-1.5 rounded-token border border-border bg-surface-muted/60 px-3 py-2.5"
      aria-busy={busy || undefined}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] text-muted-foreground">第 {index + 1} 场</span>
        <span className="font-mono text-[12.5px] text-foreground">
          {session.local_date} {weekdayIn(session.starts_at, base)}{" "}
          {timeIn(session.starts_at, base)}
        </span>
        <span className="font-sans text-[12.5px] text-foreground">{session.teacher}</span>
        <Badge variant={state.variant}>{state.text}</Badge>
        {session.state_is_override ? (
          <button
            type="button"
            onClick={onFollowDate}
            disabled={busy}
            className="border-0 bg-transparent font-sans text-[11.5px] text-primary"
          >
            恢复跟随日期
          </button>
        ) : (
          <span className="font-sans text-[11px] text-muted-foreground">跟随日期</span>
        )}
        <button
          type="button"
          onClick={onToggleEdit}
          className="ml-auto border-0 bg-transparent font-sans text-[11.5px] text-primary"
        >
          {editing ? "完成" : past ? "修正" : "改这一场"}
        </button>
      </div>

      {error && (
        <span className="font-sans text-[11.5px] text-danger">{error}</span>
      )}

      {!editing && (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {ZONE_ROWS.filter((row) => row.timeZone !== base).map((row) => (
              <span key={row.timeZone} className="font-mono text-[11px] text-muted-foreground">
                {zoneLine(session.starts_at, base, row)}
              </span>
            ))}
          </div>
          {session.note && (
            <span className="font-sans text-[11.5px] text-muted-foreground">{session.note}</span>
          )}
        </>
      )}

      {editing && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          {past && (
            // 已上过的场次挂着历史记录与作业统计，改动不是无痛的。
            <div className="rounded-token border border-danger-border bg-danger/5 px-2.5 py-1.5 font-sans text-[11.5px] text-danger">
              这一场已经上过，改动会影响历史记录和作业统计，只在修正错误时改。
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] text-muted-foreground">上课日期</span>
              <Input
                value={draft.local_date}
                onChange={(e) => setDraft({ ...draft, local_date: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] text-muted-foreground">
                时间（{zoneLabel(draft.tz)}）
              </span>
              <Input
                value={draft.local_time}
                onChange={(e) => setDraft({ ...draft, local_time: e.target.value })}
              />
            </label>
          </div>
          <ZonePicker value={draft.tz} onPick={(tz) => setDraft({ ...draft, tz })} />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">讲师</span>
            <TeacherPicker
              teachers={teachers}
              value={draft.teacher}
              onPick={(teacher) => setDraft({ ...draft, teacher })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">
              状态 <span className="font-sans">默认按日期自动判断，取消或补记时手动改</span>
            </span>
            <div className="flex gap-1.5">
              {STATES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onSave({ state_override: value })}
                  className={chip(session.state === value)}
                >
                  {STATE_LABEL[value].text}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">备注</span>
            <Input
              value={draft.note}
              placeholder="这一场为什么开：加场 / 时区 / 合作方专场…"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            {/* 与保存按钮一样在写入期间禁用：busy 是全页共享的，
                连点会把同一个删除发两遍。 */}
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="border-0 bg-transparent font-sans text-[11.5px] text-danger"
            >
              删除这一场
            </button>
            <Button variant="secondary" onClick={() => onSave(draft)} disabled={busy}>
              保存这一场
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TeacherPicker({
  teachers,
  value,
  onPick,
}: {
  teachers: string[];
  value: string;
  onPick: (teacher: string) => void;
}) {
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState("");
  const options = teachers.includes(value) || !value ? teachers : [...teachers, value];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((teacher) => (
        <button key={teacher} type="button" onClick={() => onPick(teacher)} className={chip(teacher === value)}>
          {teacher}
        </button>
      ))}
      {addingNew ? (
        <>
          <Input value={draft} placeholder="讲师姓名" onChange={(e) => setDraft(e.target.value)} />
          <Button
            variant="secondary"
            onClick={() => {
              const name = draft.trim();
              if (!name) return;
              onPick(name);
              setDraft("");
              setAddingNew(false);
            }}
          >
            加入
          </Button>
        </>
      ) : (
        // 讲师不是实体，是场次上出现过的名字。新名字当场录入即可。
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="border-0 bg-transparent font-sans text-[11.5px] text-primary"
        >
          + 新讲师
        </button>
      )}
    </div>
  );
}

function AddSession({
  teachers,
  onCancel,
  onAdd,
  busy,
  error,
  defaultTz,
}: {
  teachers: string[];
  onCancel: () => void;
  onAdd: (body: Record<string, string>) => void;
  busy: boolean;
  error: string | null;
  /** 课程的默认时区。预选它，讲师就不必把美东 20:30 先换算成美西 17:30。 */
  defaultTz: string;
}) {
  const [draft, setDraft] = useState({
    local_date: "",
    local_time: "",
    tz: defaultTz,
    teacher: "",
    note: "",
  });
  const ready = draft.local_date.trim() && draft.local_time.trim() && draft.teacher.trim();

  return (
    <div className="flex flex-col gap-2 rounded-token border border-dashed border-border bg-surface-muted/40 px-3 py-2.5">
      <div className="font-sans text-[12.5px] font-medium">
        新增一场 · 按所选时区填，其他时区自动换算
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">
            上课日期 <span className="text-danger">*</span>
          </span>
          <Input
            value={draft.local_date}
            placeholder="2026-08-22"
            onChange={(e) => setDraft({ ...draft, local_date: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">
            时间（{zoneLabel(draft.tz)}） <span className="text-danger">*</span>
          </span>
          <Input
            value={draft.local_time}
            placeholder="19:30"
            onChange={(e) => setDraft({ ...draft, local_time: e.target.value })}
          />
        </label>
      </div>
      <ZonePicker value={draft.tz} onPick={(tz) => setDraft({ ...draft, tz })} />
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] text-muted-foreground">
          讲师 <span className="text-danger">*</span>
        </span>
        <TeacherPicker
          teachers={teachers}
          value={draft.teacher}
          onPick={(teacher) => setDraft({ ...draft, teacher })}
        />
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[11px] text-muted-foreground">
          备注 <span className="font-sans">这一场为什么开</span>
        </span>
        <Input
          value={draft.note}
          placeholder="如 第一场报满后加的第二场 / 为亚洲时区加的晚场"
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </label>
      {error && <span className="font-sans text-[11.5px] text-danger">{error}</span>}
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button variant="primary" onClick={() => onAdd(draft)} disabled={busy || !ready}>
          添加这一场
        </Button>
      </div>
    </div>
  );
}
