"use client";

import { useEffect, useState } from "react";

import { Button, Card, Input } from "@/components/ui";

/** 后端形状原样透传，不做 snake→camel 映射——跟本目录 `getCourses` 同一套约定。 */
export interface RubricItemState {
  item: string;
  max_score: number | null;
}

type SaveResult = { ok: true } | { ok: false; message: string };

interface RubricEditorProps {
  courseId: string;
  onLoad: (courseId: string) => Promise<RubricItemState[]>;
  onSave: (courseId: string, items: RubricItemState[]) => Promise<SaveResult>;
}

/**
 * 课程页的评分标准维护：分项名字系统自动列出（去重自已导入的成绩），
 * 讲师逐项填一个满分。留空 = 未配置，不阻塞使用。
 *
 * 整表提交，不是逐项保存——跟后端 `PUT /api/homework/rubric` 的整表覆盖式写入
 * 同一套语义。
 */
export function RubricEditor({ courseId, onLoad, onSave }: RubricEditorProps) {
  const [items, setItems] = useState<RubricItemState[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    onLoad(courseId)
      .then((loaded) => {
        if (!cancelled) setItems(loaded);
      })
      .catch(() => {
        if (!cancelled) setError("读不出评分标准，请确认还登录着，然后重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, onLoad]);

  function setMax(item: string, raw: string) {
    setItems((prev) =>
      prev?.map((row) =>
        row.item === item ? { ...row, max_score: raw === "" ? null : Number(raw) } : row,
      ) ?? prev,
    );
  }

  async function save() {
    if (!items) return;
    setSaving(true);
    setError(null);
    const result = await onSave(courseId, items);
    setSaving(false);
    if (!result.ok) setError(result.message);
  }

  if (items === null) {
    return (
      <Card>
        {error ? (
          <p
            role="alert"
            className="m-0 rounded-token border border-danger-border bg-danger-surface px-3 py-2 font-sans text-[12.5px] text-danger"
          >
            {error}
          </p>
        ) : (
          <p className="m-0 font-sans text-[12.5px] text-muted">正在读取评分标准…</p>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <div className="font-sans text-sm font-semibold">评分标准</div>
          <span className="font-sans text-[11.5px] text-muted-foreground">
            分项名字来自这门课已导入的成绩，讲师逐项填一个满分；留空表示还没配置。
          </span>
        </div>

        {items.length === 0 ? (
          <p className="m-0 font-sans text-[12.5px] text-muted">
            这门课还没有任何提交，导入成绩之后才能看到分项名字。
          </p>
        ) : (
          <table className="w-full border-collapse font-sans text-[12.5px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-normal">分项</th>
                <th className="w-24 py-1 font-normal">满分</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.item} className="border-t border-border">
                  <td className="py-1.5">{row.item}</td>
                  <td className="py-1.5">
                    <Input
                      data-testid={`max-${row.item}`}
                      type="number"
                      inputMode="numeric"
                      className="h-8 w-20 px-2 font-mono"
                      placeholder="未配置"
                      value={row.max_score ?? ""}
                      onChange={(e) => setMax(row.item, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {error && (
          <p
            role="alert"
            className="m-0 rounded-token border border-danger-border bg-danger-surface px-3 py-2 font-sans text-[12.5px] text-danger"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || items.length === 0}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
