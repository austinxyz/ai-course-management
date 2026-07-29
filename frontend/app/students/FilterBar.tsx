import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SOURCES, TAGS } from "./mock-data";

interface FilterBarProps {
  scope: "active" | "archived";
  onScope: (scope: "active" | "archived") => void;
  activeCount: number;
  archivedCount: number;

  query: string;
  onQuery: (query: string) => void;

  align: "all" | "aligned" | "unaligned";
  onAlign: (align: "all" | "aligned" | "unaligned") => void;
  totalCount: number;
  alignedCount: number;
  unalignedCount: number;

  tag: string[];
  onToggleTag: (tag: string) => void;

  source: string | null;
  onToggleSource: (source: string) => void;

  isFiltered: boolean;
  onReset: () => void;
  resultLabel: string;
}

function segClass(active: boolean) {
  return cn(
    "inline-flex h-[30px] items-center gap-1.5 rounded-md border-0 px-[11px] font-sans text-[12.5px] font-medium",
    active ? "bg-surface text-foreground shadow-sm" : "bg-transparent text-muted",
  );
}

function numClass(active: boolean) {
  return cn("font-mono text-[11px]", active ? "text-primary" : "text-muted-foreground");
}

function pillClass(active: boolean) {
  return cn(
    "inline-flex h-6 items-center whitespace-nowrap rounded-token border px-2.5 font-sans text-[11.5px]",
    active ? "border-primary bg-primary font-medium text-primary-foreground" : "border-border bg-surface text-foreground",
  );
}

export function FilterBar(props: FilterBarProps) {
  const {
    scope, onScope, activeCount, archivedCount,
    query, onQuery,
    align, onAlign, totalCount, alignedCount, unalignedCount,
    tag, onToggleTag,
    source, onToggleSource,
    isFiltered, onReset, resultLabel,
  } = props;

  return (
    // Labelled as a toolbar: the tag and source names here also appear in the
    // detail panel as edit controls, and without the distinction neither a
    // screen reader nor a test can tell "filter by 活跃" from "add 活跃".
    <div
      role="toolbar"
      aria-label="筛选"
      className="flex flex-none flex-wrap items-center gap-2.5 border-b border-border bg-surface px-[22px] py-[11px]"
    >
      <div className="flex flex-none items-center gap-0 rounded-token border border-border bg-surface-muted p-0.5">
        <button type="button" onClick={() => onScope("active")} className={segClass(scope === "active")}>
          在读<span className={numClass(scope === "active")}>{activeCount}</span>
        </button>
        <button type="button" onClick={() => onScope("archived")} className={segClass(scope === "archived")}>
          已归档<span className={numClass(scope === "archived")}>{archivedCount}</span>
        </button>
      </div>

      <div className="relative w-[250px] flex-none">
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="#a09a90"
          strokeWidth="1.3"
          strokeLinecap="round"
          className="absolute left-[11px] top-[11px]"
        >
          <circle cx="7" cy="7" r="4.4" />
          <path d="M10.4 10.4L14 14" />
        </svg>
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="搜索姓名或邮箱"
          className="h-9 pl-[31px]"
        />
      </div>

      <div className="flex items-center gap-0 rounded-token border border-border bg-surface-muted p-0.5">
        <button type="button" onClick={() => onAlign("all")} className={segClass(align === "all")}>
          全部<span className={numClass(align === "all")}>{totalCount}</span>
        </button>
        <button type="button" onClick={() => onAlign("aligned")} className={segClass(align === "aligned")}>
          已对齐<span className={numClass(align === "aligned")}>{alignedCount}</span>
        </button>
        <button type="button" onClick={() => onAlign("unaligned")} className={segClass(align === "unaligned")}>
          未对齐微信<span className={numClass(align === "unaligned")}>{unalignedCount}</span>
        </button>
      </div>

      <div className="ml-1 flex flex-wrap items-center gap-1.5 border-l border-border/70 pl-1">
        <span className="pr-0.5 font-mono text-[11px] font-medium tracking-wide text-muted-foreground">标签</span>
        {TAGS.map((t) => (
          <button key={t} type="button" onClick={() => onToggleTag(t)} className={pillClass(tag.includes(t))}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-l border-border/70 pl-1">
        <span className="pr-0.5 font-mono text-[11px] font-medium tracking-wide text-muted-foreground">来源</span>
        {SOURCES.map((s) => (
          <button key={s} type="button" onClick={() => onToggleSource(s)} className={pillClass(source === s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-7 items-center rounded-token border-0 bg-transparent px-2.5 font-sans text-[12.5px] font-medium text-primary"
          >
            清除筛选
          </button>
        )}
        <span className="font-mono text-xs text-muted">{resultLabel}</span>
      </div>
    </div>
  );
}
