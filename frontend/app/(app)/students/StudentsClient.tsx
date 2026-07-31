"use client";

import { useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";
import { BLANK_FORM, TZ_BY_REGION } from "./vocab";
import {
  archiveStudentAction,
  changeEnrollmentSessionAction,
  createEnrollmentAction,
  createStudentAction,
  deleteEnrollmentAction,
  restoreStudentAction,
  updateStudentField,
} from "./actions";
import { FilterBar } from "./FilterBar";
import { StudentsTable, NoResultsState, EmptyDatabaseState } from "./StudentsTable";
import { DetailPanel } from "./DetailPanel";
import { NewStudentModal } from "./NewStudentModal";
import { EnrollmentModal } from "./EnrollmentModal";
import type { Course } from "@/app/(app)/courses/types";
import type {
  EditableFieldKey,
  Enrollment,
  FieldStatus,
  NewStudentForm,
  Student,
  StudentOverride,
  WritableFieldKey,
} from "./types";

interface StudentsClientProps {
  students: Student[];
  archivedStudents: Student[];
  enrollments: Enrollment[];
  courses: Course[];
}

/**
 * Key for one field of one student.
 *
 * Saving state is per field, not per panel: an edit costs a round trip, and
 * several fields are usually filled in one after another. A panel-wide lock
 * would make that sequence wait on itself.
 */
function fieldKey(email: string, field: string): string {
  return `${email}:${field}`;
}

export function StudentsClient({
  students,
  archivedStudents,
  enrollments,
  courses,
}: StudentsClientProps) {
  const [scope, setScope] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [align, setAlign] = useState<"all" | "aligned" | "unaligned">("all");
  const [tag, setTag] = useState<string[]>([]);
  const [source, setSource] = useState<string | null>(null);

  // No local copy of the students. The server is the only source of truth —
  // the previous `over` / `added` / `archived` state made the page show edits
  // that had never been written, and they vanished on reload.
  const [fieldStatus, setFieldStatus] = useState<Record<string, FieldStatus>>({});
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<
    { kind: "archived" | "exists" | "other"; message: string } | null
  >(null);
  const [, startTransition] = useTransition();

  const [selected, setSelected] = useState<string | null>(students[0]?.email ?? null);
  const [askArchive, setAskArchive] = useState(false);
  const [tagEdit, setTagEdit] = useState(false);
  const [editKey, setEditKey] = useState<EditableFieldKey | "note" | null>(null);
  const [editVal, setEditVal] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  // 报课日期的默认值取**美西的今天**，与后端判断场次已上/未到用的是同一个时区。
  // 用浏览器本地日期会让美东傍晚之后录入的记录比讲师所想的早一天。
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
  // 场次选项按课程归拢一次：补录弹窗与行内改场次共用同一份，
  // 两处各算一遍必然会在某天长出不同的标签。
  const sessionsByCourse = useMemo(
    () =>
      Object.fromEntries(
        courses.map((c) => [
          c.id,
          c.sessions.map((s) => ({
            id: s.id,
            label: `${s.local_date} ${s.local_time.slice(0, 5)}`,
          })),
        ]),
      ),
    [courses],
  );
  const [form, setFormState] = useState<NewStudentForm>(BLANK_FORM);

  const inScope = scope === "archived";
  const data = inScope ? archivedStudents : students;

  const unalignedCount = useMemo(() => data.filter((s) => !s.wechat).length, [data]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = data.filter((s) => {
      // Five fields, plain substring, nothing cleverer. Search here serves one
      // workflow — matching a WeChat group roster against the roster by hand —
      // and in that moment the nickname is the only handle available: the real
      // name may differ and the email is unknown (requirements §5). Fuzzy
      // matching, pinyin or similarity ranking would turn recognition
      // assistance into the system guessing who someone is, and a nickname
      // cannot identify a person.
      //
      // Notes and tags stay out: notes hold long pasted write-ups that would
      // drown the signal, and tags already have their own filter, so matching
      // them would make "why is this row in my results" unanswerable.
      const haystack = [s.name, s.email, s.nick, s.wxName, s.wechat];
      if (q && !haystack.some((v) => v.toLowerCase().includes(q))) return false;
      if (align === "aligned" && !s.wechat) return false;
      if (align === "unaligned" && s.wechat) return false;
      if (tag.length && !tag.every((t) => s.tags.includes(t))) return false;
      if (source && s.source !== source) return false;
      return true;
    });
    return filtered.slice().sort((a, b) => (a.wechat ? 1 : 0) - (b.wechat ? 1 : 0));
  }, [data, query, align, tag, source]);

  const isFiltered = !!query || align !== "all" || tag.length > 0 || !!source;
  const activeCount = students.length;
  const archivedCount = archivedStudents.length;

  const selectedStudent = useMemo(() => data.find((s) => s.email === selected) ?? null, [data, selected]);
  const isSelectedArchived = inScope;

  const duplicate = useMemo(() => {
    const email = form.email.trim().toLowerCase();
    if (!email) return null;
    return students.find((s) => s.email.toLowerCase() === email) ?? null;
  }, [students, form.email]);

  const archivedDuplicate = useMemo(() => {
    const email = form.email.trim().toLowerCase();
    if (!email) return null;
    return archivedStudents.find((s) => s.email.toLowerCase() === email) ?? null;
  }, [archivedStudents, form.email]);

  const canSave = !!form.name.trim() && /.+@.+\..+/.test(form.email.trim()) && !duplicate;

  function setStatus(key: string, status: FieldStatus | null) {
    setFieldStatus((st) => {
      const next = { ...st };
      if (status === null) delete next[key];
      else next[key] = status;
      return next;
    });
  }

  /**
   * Send one field to the server and reflect the outcome on that field alone.
   *
   * On failure the attempted value is kept in the status, not discarded. The
   * value the user just typed — most often a wechat handle, which takes manual
   * matching against a group roster to obtain — is the expensive part; dropping
   * it back to the stored value on error would throw away exactly that.
   */
  function saveField(email: string, field: WritableFieldKey, value: string | string[]) {
    const key = fieldKey(email, field);
    setStatus(key, { state: "saving" });
    startTransition(async () => {
      try {
        await updateStudentField(email, { [field]: value } as StudentOverride);
        setStatus(key, null);
      } catch {
        setStatus(key, { state: "failed", value, message: "没保存上。" });
      }
    });
  }

  function startEdit(key: EditableFieldKey | "note", value: string) {
    setEditKey(key);
    // A previous failure holds the value the user typed; resume from that
    // rather than from the stored one, which is the value they were replacing.
    const failed = selected ? fieldStatus[fieldKey(selected, key)] : undefined;
    setEditVal(
      failed?.state === "failed" && typeof failed.value === "string"
        ? failed.value
        : (value ?? ""),
    );
  }

  function commitEdit() {
    if (!editKey || !selected) return;
    const value = editVal.trim();
    setEditKey(null);
    setEditVal("");
    saveField(selected, editKey, value);
  }

  function onEditKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    else if (e.key === "Escape") {
      setEditKey(null);
      setEditVal("");
    }
  }

  function retryField(field: WritableFieldKey) {
    if (!selected) return;
    const status = fieldStatus[fieldKey(selected, field)];
    if (status?.state !== "failed") return;
    saveField(selected, field, status.value);
  }

  function pickEnum(key: EditableFieldKey, value: string) {
    if (!selected) return;
    setEditKey(null);
    saveField(selected, key, value);
  }

  function toggleDetailTag(t: string) {
    if (!selectedStudent) return;
    const has = selectedStudent.tags.includes(t);
    saveField(
      selectedStudent.email,
      "tags",
      has ? selectedStudent.tags.filter((x) => x !== t) : selectedStudent.tags.concat(t),
    );
  }

  function toggleListTag(t: string) {
    setTag((st) => (st.includes(t) ? st.filter((x) => x !== t) : st.concat(t)));
  }

  function toggleSourceFilter(s: string) {
    setSource((st) => (st === s ? null : s));
  }

  function setForm(patchVal: Partial<NewStudentForm>) {
    setFormState((st) => ({ ...st, ...patchVal }));
    setCreateError(null);
  }

  function toggleFormTag(t: string) {
    setFormState((st) => ({ ...st, tags: st.tags.includes(t) ? st.tags.filter((x) => x !== t) : st.tags.concat(t) }));
  }

  function saveStudent(keepOpen: boolean) {
    const f = form;
    const email = f.email.trim();
    setCreateError(null);
    startTransition(async () => {
      // The action reports a refusal by returning it. The archived collision is
      // called out separately because the remedy differs: this is not "pick
      // another email", it is "the person already exists, go restore them".
      // Creating anyway would either overwrite the notes, tags and wechat
      // handle on that record or silently un-archive it — the mock rules out
      // both.
      let result;
      try {
        result = await createStudentAction({
          email,
          name: f.name.trim(),
          region: f.region,
          level: f.level,
          source: f.source,
          wechat: f.wechat.trim(),
          wxName: f.wxName.trim() || "—",
          nick: f.nick.trim() || "—",
          note: f.note.trim(),
          tags: f.tags,
        });
      } catch {
        // Only unexpected failures reach here — a rejected credential, or the
        // action never running at all.
        setCreateError({ kind: "other", message: "没保存上。" });
        return;
      }

      if (!result.ok) {
        setCreateError({ kind: result.kind, message: result.message });
        return;
      }

      setFormState(BLANK_FORM);
      setShowNew(keepOpen);
      setScope("active");
      if (!keepOpen) setSelected(email);
    });
  }

  function onSelectRow(email: string) {
    setSelected((cur) => (cur === email ? null : email));
    setAskArchive(false);
    setEditKey(null);
    setTagEdit(false);
  }

  function onCloseDetail() {
    setSelected(null);
    setAskArchive(false);
    setEditKey(null);
    setTagEdit(false);
  }

  function onOpenDuplicate() {
    setShowNew(false);
    setScope("active");
    if (duplicate) setSelected(duplicate.email);
  }

  function onGoToArchived() {
    setShowNew(false);
    setCreateError(null);
    setScope("archived");
    if (archivedDuplicate) setSelected(archivedDuplicate.email);
  }

  function runArchiveAction(action: (email: string) => Promise<void>, email: string) {
    // Disabling the button for the duration is the point: the confirmation is
    // already behind a second click, and a double-click here would fire the
    // same request twice.
    setArchivePending(true);
    setArchiveError(null);
    startTransition(async () => {
      try {
        await action(email);
        setAskArchive(false);
        setSelected(null);
      } catch {
        // Say so. Without this the button simply becomes clickable again,
        // which is indistinguishable from a write that succeeded — and the
        // student stays on screen either way.
        setArchiveError("没归档成功。");
      } finally {
        setArchivePending(false);
      }
    });
  }

  return (
    // 侧边栏与整屏容器归 (app)/layout.tsx —— 放在这里的话，
    // 学员页的 loading/error 会把侧边栏一起替掉。
    <>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex flex-none items-end justify-between gap-5 border-b border-border bg-surface px-[22px] pb-[13px] pt-4">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-baseline gap-2.5">
                  <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">学员</h1>
                  <span className="font-mono text-xs text-muted">
                    {inScope ? `${data.length} 人已归档` : `${data.length} 人在读 · ${unalignedCount} 人未对齐微信`}
                  </span>
                </div>
                <p className="m-0 font-sans text-[12.5px] text-muted">
                  邮箱为唯一标识；微信号用于催作业，需人工对齐。
                </p>
              </div>
              <div className="flex flex-none items-center gap-2">
                <Button variant="secondary">导出 CSV</Button>
                <Button variant="primary" onClick={() => setShowNew(true)}>
                  新增学员
                </Button>
              </div>
            </header>

            <FilterBar
              scope={scope}
              onScope={(s) => {
                setScope(s);
                setSelected(null);
                setAskArchive(false);
              }}
              activeCount={activeCount}
              archivedCount={archivedCount}
              query={query}
              onQuery={setQuery}
              align={align}
              onAlign={setAlign}
              totalCount={data.length}
              alignedCount={data.length - unalignedCount}
              unalignedCount={unalignedCount}
              tag={tag}
              onToggleTag={toggleListTag}
              source={source}
              onToggleSource={toggleSourceFilter}
              isFiltered={isFiltered}
              onReset={() => {
                setQuery("");
                setAlign("all");
                setTag([]);
                setSource(null);
              }}
              resultLabel={`${list.length} / ${data.length}`}
            />

            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="min-w-0 flex-1 overflow-auto">
                {list.length > 0 ? (
                  <StudentsTable
                    rows={list}
                    selectedEmail={selected}
                    archived={inScope ? list.map((s) => s.email) : []}
                    onSelect={onSelectRow}
                  />
                ) : data.length === 0 && !inScope ? (
                  <EmptyDatabaseState onOpenNew={() => setShowNew(true)} />
                ) : (
                  <NoResultsState
                    onReset={() => {
                      setQuery("");
                      setAlign("all");
                      setTag([]);
                      setSource(null);
                    }}
                  />
                )}
              </div>

              {selectedStudent && (
                <DetailPanel
                  student={selectedStudent}
                  enrollments={enrollments.filter((e) => e.studentEmail === selectedStudent.email)}
                  onAddEnrollment={() => setShowEnroll(true)}
                  sessionsByCourse={sessionsByCourse}
                  onChangeEnrollmentSession={changeEnrollmentSessionAction}
                  onDeleteEnrollment={deleteEnrollmentAction}
                  isArchived={isSelectedArchived}
                  editKey={editKey}
                  editValue={editVal}
                  tagEditing={tagEdit}
                  askArchive={askArchive}
                  archivePending={archivePending}
                  archiveError={archiveError}
                  fieldStatus={fieldStatus}
                  onRetryField={retryField}
                  onClose={onCloseDetail}
                  onStartEdit={startEdit}
                  onEditValueChange={setEditVal}
                  onCommitEdit={commitEdit}
                  onEditKeyDown={onEditKeyDown}
                  onPickEnum={pickEnum}
                  onToggleTagEditing={() => setTagEdit((v) => !v)}
                  onToggleTag={toggleDetailTag}
                  onFillWechat={() => startEdit("wechat", "")}
                  onAskArchive={() => setAskArchive(true)}
                  onCancelArchive={() => {
                    setAskArchive(false);
                    setArchiveError(null);
                  }}
                  onArchive={() => runArchiveAction(archiveStudentAction, selectedStudent.email)}
                  onRestore={() => runArchiveAction(restoreStudentAction, selectedStudent.email)}
                />
              )}
            </div>
        </div>
      </main>

      {showEnroll && selectedStudent && (
        <EnrollmentModal
          studentName={selectedStudent.name}
          courses={courses.map((c) => ({
            id: c.id,
            name: c.name,
            offline: c.offline,
            sessions: sessionsByCourse[c.id] ?? [],
          }))}
          today={today}
          onSave={(draft) =>
            createEnrollmentAction({
              studentEmail: selectedStudent.email,
              courseId: draft.courseId,
              sessionId: draft.sessionId,
              enrolledAt: draft.enrolledAt,
              note: draft.note,
            })
          }
          onClose={() => setShowEnroll(false)}
        />
      )}

      {showNew && (
        <NewStudentModal
          form={form}
          onChange={setForm}
          onToggleTag={toggleFormTag}
          duplicate={duplicate}
          onOpenDuplicate={onOpenDuplicate}
          createError={createError}
          archivedDuplicateName={archivedDuplicate?.name ?? null}
          onGoToArchived={onGoToArchived}
          canSave={canSave}
          onClose={() => setShowNew(false)}
          onSave={() => canSave && saveStudent(false)}
          onSaveAndContinue={() => canSave && saveStudent(true)}
        />
      )}
    </>
  );
}
