import { type KeyboardEvent } from "react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { FIELDS, LEVELS, SOURCES, TAG_COLORS, TAGS, TZ_BY_REGION } from "./mock-data";
import type { EditableFieldKey, Student } from "./types";

interface DetailPanelProps {
  student: Student;
  isArchived: boolean;
  editKey: EditableFieldKey | "note" | null;
  editValue: string;
  tagEditing: boolean;
  askArchive: boolean;

  onClose: () => void;
  onStartEdit: (key: EditableFieldKey | "note", value: string) => void;
  onEditValueChange: (value: string) => void;
  onCommitEdit: () => void;
  onEditKeyDown: (e: KeyboardEvent) => void;
  onPickEnum: (key: EditableFieldKey, value: string) => void;

  onToggleTagEditing: () => void;
  onToggleTag: (tag: string) => void;

  onFillWechat: () => void;
  onAskArchive: () => void;
  onCancelArchive: () => void;
  onArchive: () => void;
  onRestore: () => void;
}

function enumOptions(key: EditableFieldKey): string[] {
  if (key === "region") return Object.keys(TZ_BY_REGION);
  if (key === "level") return [...LEVELS];
  if (key === "source") return SOURCES;
  if (key === "gender") return ["男", "女", "未填"];
  return [];
}

function pillClass(active: boolean) {
  return cn(
    "inline-flex h-[26px] items-center whitespace-nowrap rounded-token border px-2.5 font-sans text-xs",
    active ? "border-primary bg-primary font-medium text-primary-foreground" : "border-border bg-surface text-foreground",
  );
}

export function DetailPanel(props: DetailPanelProps) {
  const {
    student, isArchived, editKey, editValue, tagEditing, askArchive,
    onClose, onStartEdit, onEditValueChange, onCommitEdit, onEditKeyDown, onPickEnum,
    onToggleTagEditing, onToggleTag,
    onFillWechat, onAskArchive, onCancelArchive, onArchive, onRestore,
  } = props;

  const noWechat = !student.wechat && !isArchived;
  const sid = "stu_" + student.email.split("@")[0].replace(/\./g, "_");

  return (
    <aside className="flex w-[358px] flex-none flex-col overflow-y-auto border-l border-border bg-surface">
      <div className="flex items-start justify-between gap-2.5 border-b border-border px-[18px] pb-3 pt-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="font-sans text-base font-semibold leading-snug">{student.name}</div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-muted">
              {student.email}
            </span>
            <Badge variant="muted">只读</Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-token border border-border bg-surface-muted font-sans text-sm text-muted"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-3.5 px-[18px] py-3.5">
        {isArchived && (
          <div className="flex flex-col gap-2 rounded-token border border-border bg-surface-muted p-3">
            <div className="flex items-center gap-1.5">
              <Badge variant="muted">已归档</Badge>
              <span className="font-sans text-xs text-muted">不进入名单、催作业与统计</span>
            </div>
            <p className="m-0 font-sans text-[12.5px] leading-relaxed text-muted">
              作业与互动记录都还在。重新导入同一邮箱不会新建学员，会提示恢复这条记录。
            </p>
            <Button variant="primary" size="sm" onClick={onRestore} className="self-start">
              恢复为在读
            </Button>
          </div>
        )}

        {noWechat && (
          <div className="flex flex-col gap-2 rounded-token border border-danger-border bg-danger-surface p-3">
            <div className="flex items-center gap-1.5">
              <Badge variant="danger">未对齐微信</Badge>
              <span className="font-sans text-xs text-[#8a4136]">只能走邮件催作业</span>
            </div>
            <p className="m-0 font-sans text-[12.5px] leading-relaxed text-muted">
              仍可用邮箱催作业，但触达率低。用下面的微信昵称在群成员里人工比对，确认后回填微信号。
            </p>
            <Button variant="primary" size="sm" onClick={onFillWechat} className="self-start">
              回填微信号
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-[11px] tracking-wide text-muted-foreground">字段 · 点击即改</div>
          <span className="font-sans text-[11px] text-muted-foreground">回车保存 · Esc 取消</span>
        </div>

        <div className="-mt-1.5 flex flex-col overflow-hidden rounded-token border border-border">
          {FIELDS.map((fd, i) => {
            const editing = editKey === fd.key;
            const raw = fd.key === "sid" ? sid : (student as unknown as Record<string, string>)[fd.key];
            const empty = !raw || raw === "—";
            const warn = fd.key === "wechat" && empty;
            const shown = fd.key === "region" ? `${student.region} · ${student.tz}` : empty ? fd.placeholder ?? "未填" : raw;

            return (
              <div
                key={fd.key}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-1.5",
                  i % 2 ? "bg-surface-muted/40" : "bg-surface",
                  i === FIELDS.length - 1 ? "" : "border-b border-border/60",
                )}
              >
                <span className="w-[74px] flex-none pt-px font-sans text-xs text-muted">{fd.label}</span>
                <div className="min-w-0 flex-1">
                  {editing && fd.type === "text" ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => onEditValueChange(e.target.value)}
                      onBlur={onCommitEdit}
                      onKeyDown={onEditKeyDown}
                      className={cn(
                        "h-7 w-full rounded-md border border-primary bg-surface px-2 text-[12.5px] outline-none",
                        fd.mono ? "font-mono" : "font-sans",
                      )}
                    />
                  ) : editing && fd.type === "enum" ? (
                    <div className="flex flex-wrap gap-1.5 py-px">
                      {enumOptions(fd.key as EditableFieldKey).map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => onPickEnum(fd.key as EditableFieldKey, o)}
                          className={pillClass((student as unknown as Record<string, string>)[fd.key] === o)}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fd.type !== "ro" && onStartEdit(fd.key as EditableFieldKey, raw === "—" ? "" : raw)}
                      className={cn(
                        "block w-full border-0 bg-transparent py-0.5 text-left text-[12.5px] leading-relaxed",
                        fd.mono ? "font-mono" : "font-sans",
                        warn ? "font-medium text-danger" : empty ? "text-muted-foreground/70" : "text-foreground",
                        fd.type === "ro" ? "cursor-default" : "cursor-text",
                      )}
                    >
                      {shown}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-[11px] tracking-wide text-muted-foreground">标签</div>
            <button
              type="button"
              onClick={onToggleTagEditing}
              className="inline-flex h-[22px] items-center rounded-token border border-border bg-surface-muted px-2 font-sans text-[11.5px] font-medium text-foreground"
            >
              {tagEditing ? "完成" : "编辑"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {tagEditing
              ? TAGS.map((t) => (
                  <button key={t} type="button" onClick={() => onToggleTag(t)} className={pillClass(student.tags.includes(t))}>
                    {t}
                  </button>
                ))
              : student.tags.length > 0
                ? student.tags.map((t) => {
                    const c = TAG_COLORS[t] ?? { bg: "#f3f0ea", fg: "#79736a", border: "#e4e0d8" };
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={onToggleTagEditing}
                        className="inline-flex items-center rounded-token border px-2 py-0.5 font-sans text-[11.5px] font-medium"
                        style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.border }}
                      >
                        {t}
                      </button>
                    );
                  })
                : <span className="font-sans text-xs text-muted-foreground/70">无标签</span>}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="font-mono text-[11px] tracking-wide text-muted-foreground">备注</div>
          {editKey === "note" ? (
            <textarea
              autoFocus
              rows={4}
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onBlur={onCommitEdit}
              className="w-full resize-y rounded-token border border-primary bg-surface px-3 py-2 font-sans text-[12.5px] leading-relaxed outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => onStartEdit("note", student.note)}
              className={cn(
                "block min-h-[60px] w-full cursor-text rounded-token border border-border bg-surface-muted px-3 py-2.5 text-left font-sans text-[12.5px] leading-relaxed",
                student.note ? "text-foreground" : "text-muted-foreground/70",
              )}
            >
              {student.note || "（无备注）"}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-dashed border-border pt-3.5">
          <div className="flex items-center gap-2">
            <div className="font-mono text-[11px] tracking-wide text-muted-foreground">详情页 · 草图</div>
            <Badge variant="muted">待设计</Badge>
          </div>
          {[
            { title: "报课记录", meta: "2 条" },
            { title: "作业提交", meta: "4 / 6" },
            { title: "互动记录", meta: "最近 7 天 1 条" },
          ].map((sk) => (
            <div key={sk.title} className="flex flex-col gap-1.5 rounded-token border border-dashed border-border bg-surface-muted/60 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-sans text-[12.5px] font-medium text-foreground">{sk.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{sk.meta}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="h-1.5 w-full rounded-full bg-border" />
                <div className="h-1.5 w-2/3 rounded-full bg-border" />
              </div>
            </div>
          ))}
        </div>

        {!isArchived && (
          <div className="flex flex-col gap-2 border-t border-border pt-3.5">
            {askArchive ? (
              <div className="flex flex-col gap-2.5 rounded-token border border-danger-border bg-danger-surface p-3">
                <p className="m-0 font-sans text-[12.5px] leading-relaxed text-foreground">
                  归档 <strong className="font-semibold">{student.name}</strong>？他的 2 条报课、4 份作业和互动记录会一起隐藏，但不会删除。可随时恢复。
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" onClick={onArchive}>
                    确认归档
                  </Button>
                  <Button variant="secondary" size="sm" onClick={onCancelArchive}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2.5">
                <Button variant="secondary" size="sm" onClick={onAskArchive}>
                  归档学员
                </Button>
                <span className="font-sans text-[11.5px] text-muted-foreground">硬删除需超管权限</span>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
