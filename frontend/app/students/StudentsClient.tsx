"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";
import { BLANK_FORM, TZ_BY_REGION } from "./mock-data";
import { Sidebar } from "./Sidebar";
import { FilterBar } from "./FilterBar";
import { StudentsTable, NoResultsState, EmptyDatabaseState } from "./StudentsTable";
import { DetailPanel } from "./DetailPanel";
import { NewStudentModal } from "./NewStudentModal";
import { PlaceholderPage } from "./PlaceholderPage";
import type { EditableFieldKey, NavKey, NewStudentForm, Student, StudentOverride } from "./types";

function applyOverride(student: Student, override: StudentOverride | undefined): Student {
  if (!override) return student;
  const merged = { ...student, ...override };
  if (override.region) merged.tz = TZ_BY_REGION[override.region] ?? "—";
  return merged;
}

interface StudentsClientProps {
  students: Student[];
}

export function StudentsClient({ students }: StudentsClientProps) {
  const [view, setView] = useState<NavKey>("students");
  const [scope, setScope] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [align, setAlign] = useState<"all" | "aligned" | "unaligned">("all");
  const [tag, setTag] = useState<string[]>([]);
  const [source, setSource] = useState<string | null>(null);

  const [archived, setArchived] = useState<string[]>([]);
  const [added, setAdded] = useState<Student[]>([]);
  const [over, setOver] = useState<Record<string, StudentOverride>>({});

  const [selected, setSelected] = useState<string | null>(students[0]?.email ?? null);
  const [askArchive, setAskArchive] = useState(false);
  const [tagEdit, setTagEdit] = useState(false);
  const [editKey, setEditKey] = useState<EditableFieldKey | "note" | null>(null);
  const [editVal, setEditVal] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [form, setFormState] = useState<NewStudentForm>(BLANK_FORM);

  const all = useMemo(
    () => students.concat(added).map((s) => applyOverride(s, over[s.email])),
    [students, added, over],
  );

  const inScope = scope === "archived";
  const data = useMemo(
    () => all.filter((s) => archived.includes(s.email) === inScope),
    [all, archived, inScope],
  );

  const unalignedCount = useMemo(() => data.filter((s) => !s.wechat).length, [data]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = data.filter((s) => {
      if (q && !(s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))) return false;
      if (align === "aligned" && !s.wechat) return false;
      if (align === "unaligned" && s.wechat) return false;
      if (tag.length && !tag.every((t) => s.tags.includes(t))) return false;
      if (source && s.source !== source) return false;
      return true;
    });
    return filtered.slice().sort((a, b) => (a.wechat ? 1 : 0) - (b.wechat ? 1 : 0));
  }, [data, query, align, tag, source]);

  const isFiltered = !!query || align !== "all" || tag.length > 0 || !!source;
  const activeCount = useMemo(() => all.filter((s) => !archived.includes(s.email)).length, [all, archived]);
  const archivedCount = useMemo(() => all.filter((s) => archived.includes(s.email)).length, [all, archived]);

  const selectedStudent = useMemo(() => data.find((s) => s.email === selected) ?? null, [data, selected]);
  const isSelectedArchived = !!selectedStudent && archived.includes(selectedStudent.email);

  const duplicate = useMemo(() => {
    const email = form.email.trim().toLowerCase();
    if (!email) return null;
    return all.find((s) => s.email.toLowerCase() === email) ?? null;
  }, [all, form.email]);

  const canSave = !!form.name.trim() && /.+@.+\..+/.test(form.email.trim()) && !duplicate;

  function patch(email: string, partial: StudentOverride) {
    setOver((st) => ({ ...st, [email]: { ...(st[email] ?? {}), ...partial } }));
  }

  function startEdit(key: EditableFieldKey | "note", value: string) {
    setEditKey(key);
    setEditVal(value ?? "");
  }

  function commitEdit() {
    if (!editKey || !selected) return;
    patch(selected, { [editKey]: editVal.trim() } as StudentOverride);
    setEditKey(null);
    setEditVal("");
  }

  function onEditKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    else if (e.key === "Escape") {
      setEditKey(null);
      setEditVal("");
    }
  }

  function pickEnum(key: EditableFieldKey, value: string) {
    if (!selected) return;
    patch(selected, { [key]: value } as StudentOverride);
    setEditKey(null);
  }

  function toggleDetailTag(t: string) {
    if (!selectedStudent) return;
    const has = selectedStudent.tags.includes(t);
    patch(selectedStudent.email, { tags: has ? selectedStudent.tags.filter((x) => x !== t) : selectedStudent.tags.concat(t) });
  }

  function toggleListTag(t: string) {
    setTag((st) => (st.includes(t) ? st.filter((x) => x !== t) : st.concat(t)));
  }

  function toggleSourceFilter(s: string) {
    setSource((st) => (st === s ? null : s));
  }

  function setForm(patchVal: Partial<NewStudentForm>) {
    setFormState((st) => ({ ...st, ...patchVal }));
  }

  function toggleFormTag(t: string) {
    setFormState((st) => ({ ...st, tags: st.tags.includes(t) ? st.tags.filter((x) => x !== t) : st.tags.concat(t) }));
  }

  function saveStudent(keepOpen: boolean) {
    const f = form;
    const rec: Student = {
      name: f.name.trim(),
      email: f.email.trim(),
      wechat: f.wechat.trim(),
      nick: f.nick.trim() || "—",
      wxName: f.wxName.trim() || "—",
      region: f.region,
      tz: TZ_BY_REGION[f.region] ?? "UTC+8",
      level: f.level,
      source: f.source,
      tags: f.tags.slice(),
      note: f.note.trim(),
      gender: "—",
      age: "—",
      industry: "—",
    };
    setAdded((st) => st.concat(rec));
    setFormState(BLANK_FORM);
    setShowNew(keepOpen);
    setScope("active");
    if (!keepOpen) setSelected(rec.email);
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

  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-background">
      <Sidebar view={view} onNavigate={setView} studentCount={activeCount} />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {view === "students" ? (
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
                  <StudentsTable rows={list} selectedEmail={selected} archived={archived} onSelect={onSelectRow} />
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
                  isArchived={isSelectedArchived}
                  editKey={editKey}
                  editValue={editVal}
                  tagEditing={tagEdit}
                  askArchive={askArchive}
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
                  onCancelArchive={() => setAskArchive(false)}
                  onArchive={() => {
                    setArchived((st) => st.concat(selectedStudent.email));
                    setAskArchive(false);
                    setSelected(null);
                  }}
                  onRestore={() => {
                    setArchived((st) => st.filter((e) => e !== selectedStudent.email));
                    setSelected(null);
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <PlaceholderPage view={view} onBackToStudents={() => setView("students")} />
        )}
      </main>

      {showNew && (
        <NewStudentModal
          form={form}
          onChange={setForm}
          onToggleTag={toggleFormTag}
          duplicate={duplicate}
          onOpenDuplicate={onOpenDuplicate}
          canSave={canSave}
          onClose={() => setShowNew(false)}
          onSave={() => canSave && saveStudent(false)}
          onSaveAndContinue={() => canSave && saveStudent(true)}
        />
      )}
    </div>
  );
}
