"use client";

import { useMemo, useState, useTransition } from "react";

import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  addAliasAction,
  addSessionAction,
  createCourseAction,
  deleteSessionAction,
  followDateAction,
  removeAliasAction,
  updateCourseAction,
  updateSessionAction,
  type ActionResult,
} from "./actions";
import { BLANK_COURSE, CourseModal, formFrom, type CourseForm } from "./CourseModal";
import { SessionRows } from "./SessionRows";
import type { Course } from "./types";

interface CoursesClientProps {
  courses: Course[];
  /**
   * 已有场次上出现过的讲师，去重后由后端给出。本组只渲染，排课与编辑在下一组接上——
   * 提前把它接进 props 是为了让页面取数一次到位，不必到时候再改一遍 Server Component。
   */
  teachers: string[];
}

export function CoursesClient({ courses, teachers }: CoursesClientProps) {
  // 只存"选中了谁"，课程数据本身不复制到本地 —— 本地副本会让页面显示从未写入的东西，
  // 学员名单上已经吃过一次这个亏。
  const [selectedId, setSelectedId] = useState<string | null>(courses[0]?.id ?? null);
  const selected = useMemo(
    () => courses.find((c) => c.id === selectedId) ?? courses[0] ?? null,
    [courses, selectedId],
  );

  // 弹窗与写入状态。课程数据本身仍然只来自 props。
  const [modal, setModal] = useState<{ course: Course | null; form: CourseForm } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);
  /**
   * 场次写入的失败信息，按场次分开存；`null` 那个键是"新增一场"表单。
   *
   * 不能与课程弹窗的 saveError 共用一个格子：行内编辑时弹窗是关的，
   * 而 saveError 只在弹窗里渲染 —— 那等于保存失败了什么都不说。
   */
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({});
  /**
   * 每次新增成功就 +1。新增表单据此收起 —— 失败时不动，用户输入与错误信息都留在原处。
   */
  const [sessionAdded, setSessionAdded] = useState(0);

  function failSession(key: string | null, message: string) {
    setSessionErrors((prev) => ({ ...prev, [key ?? "new"]: message }));
  }

  function clearSession(key: string | null) {
    setSessionErrors((prev) => {
      const { [key ?? "new"]: _dropped, ...rest } = prev;
      return rest;
    });
  }
  const [busy, startWrite] = useTransition();

  /**
   * 所有写入走这里。预期内的失败是**返回值**，不是异常 ——
   * 生产构建会把 Server Action 抛出的 message 抹成 digest，客户端拿不到内容。
   */
  function write(
    operation: () => Promise<ActionResult>,
    onFail: (message: string) => void,
    onDone?: () => void,
  ) {
    startWrite(async () => {
      const result = await operation();
      if (result.ok) onDone?.();
      else onFail(result.message);
    });
  }

  function saveCourse() {
    if (!modal) return;
    const name = modal.form.name.trim();
    if (!name) {
      setSaveError("课程名不能为空");
      return;
    }
    setSaveError(null);
    const target = modal.course;
    write(
      () =>
        target
          ? updateCourseAction(target.id, { ...modal.form, name })
          : createCourseAction({ ...modal.form, name }),
      (message) => setSaveError(message),
      // 只在成功后关窗。提交即关会把失败信息连同承载它的弹窗一起丢掉，
      // 用户还得把整张表单重打一遍 —— 场次那边刚修过同一个毛病。
      () => setModal(null),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-none items-end justify-between gap-5 border-b border-border bg-surface px-[22px] pb-[13px] pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">课程</h1>
            <span className="font-mono text-xs text-muted">{courses.length} 门课</span>
          </div>
          <p className="m-0 font-sans text-[12.5px] text-muted">
            每门课上一次、交一次作业。课程是报课、作业、催作业共用的口径，改这里会影响所有引用它的页面。
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setSaveError(null);
            setModal({ course: null, form: BLANK_COURSE });
          }}
        >
          新建课程
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto bg-background p-[22px]">
        {courses.length === 0 ? (
          <Card className="max-w-[640px]">
            <div className="flex flex-col gap-1.5">
              <h3 className="m-0 font-sans text-sm font-semibold">还没有课程</h3>
              <p className="m-0 font-sans text-[13px] leading-relaxed text-muted">
                建一门课之后，报课与作业才有地方挂。
              </p>
            </div>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {courses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => setSelectedId(course.id)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-token border px-3 py-2 text-left",
                    course.id === selected?.id
                      ? "border-primary bg-surface"
                      : "border-border bg-surface-muted",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-sans text-[13px] font-medium text-foreground">
                      {course.name}
                    </span>
                    {course.offline && <Badge variant="muted">已下线</Badge>}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {course.short || "—"} · {course.sessions.length} 场
                  </span>
                </button>
              ))}
            </div>

            {selected && (
              <CourseDetail
                course={selected}
                teachers={teachers}
                busy={busy}
                onEdit={() => {
                  setSaveError(null);
                  setAliasError(null);
                  setModal({ course: selected, form: formFrom(selected) });
                }}
                sessionErrors={sessionErrors}
                onSaveSession={(sessionId, patch) => {
                  clearSession(sessionId);
                  write(
                    () => updateSessionAction(selected.id, sessionId, patch),
                    (message) => failSession(sessionId, message),
                  );
                }}
                onDeleteSession={(sessionId) => {
                  clearSession(sessionId);
                  write(
                    () => deleteSessionAction(selected.id, sessionId),
                    (message) => failSession(sessionId, message),
                  );
                }}
                onFollowDate={(sessionId) => {
                  clearSession(sessionId);
                  write(
                    () => followDateAction(selected.id, sessionId),
                    (message) => failSession(sessionId, message),
                  );
                }}
                sessionAdded={sessionAdded}
                onAddSession={(body) => {
                  clearSession(null);
                  write(
                    () => addSessionAction(selected.id, body),
                    (message) => failSession(null, message),
                    () => setSessionAdded((n) => n + 1),
                  );
                }}
              />
            )}
          </>
        )}
      </div>

      {modal && (
        <CourseModal
          course={modal.course}
          form={modal.form}
          onChange={(form) => setModal({ ...modal, form })}
          onClose={() => setModal(null)}
          onSave={saveCourse}
          saving={busy}
          error={saveError}
          aliasDraft={aliasDraft}
          onAliasDraft={setAliasDraft}
          onAddAlias={() => {
            const target = modal.course;
            const raw = aliasDraft.trim();
            if (!target || !raw) return;
            setAliasError(null);
            write(() => addAliasAction(target.id, raw), (message) => setAliasError(message));
            setAliasDraft("");
          }}
          onRemoveAlias={(raw) => {
            const target = modal.course;
            if (!target) return;
            write(() => removeAliasAction(target.id, raw), setAliasError);
          }}
          aliasError={aliasError}
        />
      )}
    </div>
  );
}

interface CourseDetailProps {
  course: Course;
  teachers: string[];
  busy: boolean;
  /** 按场次 id 存的失败信息；`new` 是新增表单那一条。 */
  sessionErrors: Record<string, string>;
  /** 新增成功的计数，用来收起新增表单。 */
  sessionAdded: number;
  onEdit: () => void;
  onSaveSession: (sessionId: string, patch: Record<string, string>) => void;
  onDeleteSession: (sessionId: string) => void;
  onFollowDate: (sessionId: string) => void;
  onAddSession: (body: Record<string, string>) => void;
}

function CourseDetail({
  course,
  teachers,
  busy,
  sessionErrors,
  sessionAdded,
  onEdit,
  onSaveSession,
  onDeleteSession,
  onFollowDate,
  onAddSession,
}: CourseDetailProps) {
  return (
    <div className="flex max-w-[860px] flex-col gap-3.5">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <h2 className="m-0 font-sans text-[17px] font-semibold tracking-tight">
                {course.name}
              </h2>
              {course.offline && <Badge variant="muted">已下线</Badge>}
            </div>
            <p className="m-0 font-sans text-[13px] text-muted">{course.tagline}</p>
            <p className="m-0 font-sans text-[12.5px] leading-relaxed text-foreground/85">
              {course.intro}
            </p>
          </div>
          <Button variant="secondary" onClick={onEdit}>
            编辑课程
          </Button>
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="font-mono text-[11px] tracking-wide text-muted-foreground">平台别名</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {course.aliases.length === 0 ? (
              <span className="font-sans text-xs text-muted-foreground/70">还没有别名</span>
            ) : (
              course.aliases.map((alias) => (
                // 显示用户当初的写法：匹配用的归一化值是后端的事，而人核对平台数据时
                // 找的是自己填过的那个写法。
                <span
                  key={alias.raw}
                  className="inline-flex items-center rounded-token border border-border bg-surface-muted px-2 py-0.5 font-mono text-[11.5px]"
                >
                  {alias.raw}
                </span>
              ))
            )}
          </div>
          <span className="font-sans text-[11.5px] text-muted-foreground">
            导入时按这些写法匹配到本课程
          </span>
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="font-mono text-[11px] tracking-wide text-muted-foreground">这门课</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Fact label="每场时长" value={`${course.hours} 小时`} />
            <Fact label="场次" value={`${course.sessions.length} 场`} />
            <Fact label="简称" value={course.short || "—"} />
          </div>
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-[11px] tracking-wide text-muted-foreground">
              作业 · 一次
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-sans text-[12.5px] text-foreground">
              {course.homework_title || "还没写作业题目"}
            </span>
            <span className="font-sans text-[11.5px] text-muted-foreground">
              截止日期按场次定
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <div className="font-sans text-sm font-semibold">上课时间 · 每场独立讲师与学员</div>
          <span className="font-sans text-[11.5px] text-muted-foreground">
            时间按美西记，下面一行是各时区对应时间
          </span>
        </div>

        <SessionRows
          course={course}
          teachers={teachers}
          busy={busy}
          errors={sessionErrors}
          added={sessionAdded}
          onSave={onSaveSession}
          onDelete={onDeleteSession}
          onFollowDate={onFollowDate}
          onAdd={onAddSession}
        />
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <span className="font-sans text-[12.5px] text-foreground">{value}</span>
    </span>
  );
}
