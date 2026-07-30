import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TAG_COLORS } from "./vocab";
import type { Student } from "./types";

interface StudentsTableProps {
  rows: Student[];
  selectedEmail: string | null;
  archived: string[];
  onSelect: (email: string) => void;
}

const TD_CLASS = "h-10 overflow-hidden border-b border-border/70 px-3.5 align-middle";

function tagChipStyle(label: string) {
  const c = TAG_COLORS[label] ?? { bg: "#f3f0ea", fg: "#79736a", border: "#e4e0d8" };
  return {
    backgroundColor: c.bg,
    color: c.fg,
    borderColor: c.border,
  };
}

export function StudentsTable({ rows, selectedEmail, archived, onSelect }: StudentsTableProps) {
  if (rows.length === 0) return null;

  return (
    <table className="w-full min-w-[1180px] table-fixed border-collapse bg-surface">
      <colgroup>
        <col className="w-[148px]" />
        <col className="w-[216px]" />
        <col className="w-[176px]" />
        <col className="w-[132px]" />
        <col className="w-[92px]" />
        <col className="w-[112px]" />
        <col className="w-[190px]" />
        <col />
      </colgroup>
      <thead>
        <tr>
          {["姓名", "邮箱 · 唯一标识", "微信号", "区域", "基础", "来源", "标签", "备注"].map((h) => (
            <th
              key={h}
              className="sticky top-0 z-10 h-[34px] whitespace-nowrap border-b border-border bg-surface-muted px-3.5 text-left font-mono text-[11px] font-medium tracking-wide text-muted"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const selected = selectedEmail === s.email;
          const isArchived = archived.includes(s.email);
          const noWechat = !s.wechat;
          return (
            <tr
              key={s.email}
              onClick={() => onSelect(s.email)}
              className={cn(
                "h-10 cursor-pointer",
                selected ? "shadow-[inset_2px_0_0_var(--color-primary)] bg-primary/5" : isArchived ? "bg-surface-muted/60" : noWechat ? "bg-danger-surface/40" : "bg-surface",
              )}
            >
              <td className={TD_CLASS}>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 flex-none rounded-full"
                    style={{ backgroundColor: noWechat ? "var(--color-danger)" : "#cfc9bc" }}
                  />
                  <span
                    className={cn(
                      "overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[13.5px] font-medium",
                      isArchived ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {s.name}
                  </span>
                  {isArchived && <Badge variant="muted">已归档</Badge>}
                </div>
              </td>
              <td className={TD_CLASS}>
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px] text-foreground">
                  {s.email}
                </span>
              </td>
              <td className={TD_CLASS}>
                {s.wechat ? (
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px] text-foreground">
                    {s.wechat}
                  </span>
                ) : (
                  <Badge variant="danger">未对齐微信</Badge>
                )}
              </td>
              <td className={TD_CLASS}>
                <div className="flex flex-col gap-px">
                  <span className="font-sans text-[13px] text-foreground">{s.region}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">{s.tz}</span>
                </div>
              </td>
              <td className={TD_CLASS}>
                <Badge variant="muted">{s.level}</Badge>
              </td>
              <td className={TD_CLASS}>
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[12.5px] text-foreground">
                  {s.source}
                </span>
              </td>
              <td className={TD_CLASS}>
                <div className="flex flex-wrap gap-1">
                  {s.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center whitespace-nowrap rounded-token border px-[7px] py-px font-sans text-[11px] font-medium"
                      style={tagChipStyle(t)}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </td>
              <td className={TD_CLASS}>
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[12.5px] text-muted">
                  {s.note || "—"}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function NoResultsState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex min-h-full justify-center bg-background px-6 py-14">
      <Card className="w-[400px] max-w-full text-center">
        <div className="mb-3 flex flex-col gap-1">
          <h3 className="m-0 font-sans text-sm font-semibold">没有符合条件的学员</h3>
          <p className="m-0 font-sans text-[13px] leading-relaxed text-muted">
            当前筛选组合下没有记录。放宽标签或微信对齐条件后再试。
          </p>
        </div>
        <Button variant="secondary" onClick={onReset}>
          清除筛选
        </Button>
      </Card>
    </div>
  );
}

export function EmptyDatabaseState({ onOpenNew }: { onOpenNew: () => void }) {
  return (
    <div className="flex min-h-full justify-center bg-background px-6 py-16">
      <Card className="w-[420px] max-w-full">
        <div className="mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-token border border-border bg-surface-muted">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#79736a" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 7.2a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM1.8 13.6c0-2.3 1.9-3.6 4.2-3.6s4.2 1.3 4.2 3.6M11 3.2a2 2 0 010 4M12.4 10.4c1.2.4 1.9 1.4 1.9 3.2" />
          </svg>
        </div>
        <div className="mb-3 flex flex-col gap-1">
          <h3 className="m-0 font-sans text-sm font-semibold">暂无学员</h3>
          <p className="m-0 font-sans text-[13px] leading-relaxed text-muted">
            学员库为空。从报课表导入 CSV，或手动添加第一位学员。邮箱作为唯一标识，重复导入会自动合并。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary">导入 CSV</Button>
          <Button variant="secondary" onClick={onOpenNew}>
            手动添加
          </Button>
        </div>
      </Card>
    </div>
  );
}
