import { Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { LEVELS, SOURCES, TAGS, TZ_BY_REGION } from "./mock-data";
import type { NewStudentForm } from "./types";

interface NewStudentModalProps {
  form: NewStudentForm;
  onChange: (patch: Partial<NewStudentForm>) => void;
  onToggleTag: (tag: string) => void;

  duplicate: { name: string } | null;
  onOpenDuplicate: () => void;

  /**
   * Set when the server refused the create. Local duplicate detection only
   * covers the in-study roster — an archived student is not in that list, so
   * the collision is invisible here and only surfaces on submit.
   */
  createError: { kind: "archived" | "exists" | "other"; message: string } | null;
  archivedDuplicateName: string | null;
  onGoToArchived: () => void;

  canSave: boolean;
  onClose: () => void;
  onSave: () => void;
  onSaveAndContinue: () => void;
}

function pillClass(active: boolean) {
  return cn(
    "inline-flex h-[30px] items-center whitespace-nowrap rounded-token border px-2.5 font-sans text-[12.5px]",
    active ? "border-primary bg-primary font-medium text-primary-foreground" : "border-border bg-surface text-foreground",
  );
}

export function NewStudentModal(props: NewStudentModalProps) {
  const {
    form, onChange, onToggleTag, duplicate, onOpenDuplicate,
    createError, archivedDuplicateName, onGoToArchived,
    canSave, onClose, onSave, onSaveAndContinue,
  } = props;

  const archivedConflict = createError?.kind === "archived";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-[#1a1917]/40 px-6 pb-6 pt-14">
      <div className="flex max-h-[calc(100vh-80px)] w-[640px] max-w-full flex-col overflow-hidden rounded-token border border-border bg-surface shadow-2xl">
        <div className="flex flex-none items-start justify-between gap-3 border-b border-border px-[18px] pb-3 pt-[15px]">
          <div className="flex flex-col gap-1">
            <h3 className="m-0 font-sans text-[15px] font-semibold">新增学员</h3>
            <p className="m-0 font-sans text-[12.5px] leading-relaxed text-muted">
              邮箱是唯一标识，保存后不可修改。其余字段都能之后再补。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-token border border-border bg-surface-muted font-sans text-sm text-muted"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-sans text-[11.5px] font-medium text-foreground">
                姓名 <span className="text-danger">*</span>
              </span>
              <Input value={form.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="如 陈嘉禾" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-sans text-[11.5px] font-medium text-foreground">
                邮箱 <span className="text-danger">*</span> <span className="font-normal text-muted-foreground">唯一标识</span>
              </span>
              <Input
                value={form.email}
                onChange={(e) => onChange({ email: e.target.value })}
                placeholder="name@example.com"
                className={cn("font-mono", (duplicate || createError) && "border-danger")}
              />
            </label>
          </div>

          {archivedConflict && (
            <div className="flex flex-col gap-2.5 rounded-token border border-danger-border bg-danger-surface px-3 py-2.5">
              <span className="font-sans text-[12.5px] leading-relaxed text-[#8a4136]">
                该邮箱属于一位已归档的学员{archivedDuplicateName ? `：${archivedDuplicateName}` : ""}。
              </span>
              <span className="font-sans text-[12.5px] leading-relaxed text-muted">
                新增会与现有记录冲突，因此没有创建。若确认是同一个人，请到「已归档」里恢复他，原有的备注、标签与微信号都还在。
              </span>
              <Button variant="danger" size="sm" onClick={onGoToArchived} className="self-start">
                前往「已归档」
              </Button>
            </div>
          )}

          {/* "exists" lands here too. The pre-submit duplicate check normally
              catches that case, so reaching it means the server saw something
              the client could not — and rendering nothing at all would leave a
              failed submit looking like no submit. */}
          {(createError?.kind === "other" || createError?.kind === "exists") && (
            <div className="rounded-token border border-danger-border bg-danger-surface px-3 py-2.5">
              <span className="font-sans text-[12.5px] leading-relaxed text-danger">
                {createError.message}
              </span>
            </div>
          )}

          {duplicate && (
            <div className="flex items-center justify-between gap-2.5 rounded-token border border-danger-border bg-danger-surface px-3 py-2.5">
              <span className="font-sans text-[12.5px] leading-relaxed text-[#8a4136]">
                该邮箱已存在：{duplicate.name}。请直接编辑已有学员，不要重复创建。
              </span>
              <Button variant="danger" size="sm" onClick={onOpenDuplicate} className="flex-none">
                打开该学员
              </Button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-sans text-[11.5px] font-medium text-foreground">微信号</span>
              <Input value={form.wechat} onChange={(e) => onChange({ wechat: e.target.value })} placeholder="可留空" className="font-mono" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-sans text-[11.5px] font-medium text-foreground">微信名</span>
              <Input value={form.wxName} onChange={(e) => onChange({ wxName: e.target.value })} placeholder="用于比对" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-sans text-[11.5px] font-medium text-foreground">微信昵称</span>
              <Input value={form.nick} onChange={(e) => onChange({ nick: e.target.value })} placeholder="群里显示" />
            </label>
          </div>

          {!form.wechat.trim() && (
            <div className="flex items-center gap-2 rounded-token border border-dashed border-border bg-surface-muted/60 px-3 py-2.5">
              <Badge variant="muted">未对齐微信</Badge>
              <span className="font-sans text-[12.5px] leading-relaxed text-muted">
                留空可以保存，该学员会在名单里标红，只能走邮件催作业。
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="font-sans text-[11.5px] font-medium text-foreground">区域 · 时区</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(TZ_BY_REGION).map((r) => (
                <button key={r} type="button" onClick={() => onChange({ region: r as NewStudentForm["region"] })} className={pillClass(form.region === r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-[11.5px] font-medium text-foreground">基础</span>
              <div className="flex flex-wrap gap-1.5">
                {LEVELS.map((l) => (
                  <button key={l} type="button" onClick={() => onChange({ level: l })} className={pillClass(form.level === l)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-[11.5px] font-medium text-foreground">
                来源 <span className="font-normal text-muted-foreground">合作伙伴</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <button key={s} type="button" onClick={() => onChange({ source: s })} className={pillClass(form.source === s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-sans text-[11.5px] font-medium text-foreground">标签</span>
            <div className="flex flex-wrap gap-1.5">
              {TAGS.map((t) => (
                <button key={t} type="button" onClick={() => onToggleTag(t)} className={pillClass(form.tags.includes(t))}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-sans text-[11.5px] font-medium text-foreground">备注</span>
            <textarea
              rows={3}
              placeholder="报课渠道细节、时区限制、跟进要点…"
              value={form.note}
              onChange={(e) => onChange({ note: e.target.value })}
              className="w-full resize-y rounded-token border border-border bg-surface px-3 py-2 font-sans text-[13px] leading-relaxed outline-none"
            />
          </label>
        </div>

        <div className="flex flex-none items-center justify-between gap-3 border-t border-border bg-surface-muted/40 px-[18px] py-3">
          <span className="font-sans text-xs text-muted-foreground">
            批量导入请用 <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }}>CSV 导入</a>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button variant="secondary" onClick={onSaveAndContinue} disabled={!canSave}>
              保存并继续新增
            </Button>
            <Button variant="primary" onClick={onSave} disabled={!canSave}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
