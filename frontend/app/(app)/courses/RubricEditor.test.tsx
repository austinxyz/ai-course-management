import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RubricEditor } from "./RubricEditor";

describe("RubricEditor", () => {
  it("分项名字系统自动列出，不需要讲师手动输入", async () => {
    const onLoad = vi.fn().mockResolvedValue([
      { item: "A1", max_score: 50 },
      { item: "D2", max_score: null },
    ]);
    render(<RubricEditor courseId="c-1" onLoad={onLoad} onSave={vi.fn()} />);

    expect(await screen.findByTestId("max-A1")).toHaveValue(50);
    const d2 = screen.getByTestId("max-D2");
    expect(d2).toHaveValue(null);
    expect(d2).toHaveAttribute("placeholder", "未配置");
    expect(onLoad).toHaveBeenCalledWith("c-1");
  });

  it("保存整表", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn().mockResolvedValue([{ item: "A1", max_score: null }]);
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<RubricEditor courseId="c-1" onLoad={onLoad} onSave={onSave} />);

    const input = await screen.findByTestId("max-A1");
    await user.type(input, "50");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("c-1", [{ item: "A1", max_score: 50 }]),
    );
  });

  it("留空不阻塞保存", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn().mockResolvedValue([
      { item: "A1", max_score: 50 },
      { item: "D2", max_score: null },
    ]);
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<RubricEditor courseId="c-1" onLoad={onLoad} onSave={onSave} />);

    await screen.findByTestId("max-A1");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("c-1", [
        { item: "A1", max_score: 50 },
        { item: "D2", max_score: null },
      ]),
    );
  });

  it("拒绝非正整数时就地显示错误", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn().mockResolvedValue([{ item: "A1", max_score: null }]);
    const onSave = vi.fn().mockResolvedValue({ ok: false, message: "「A1」的满分必须是正整数" });
    render(<RubricEditor courseId="c-1" onLoad={onLoad} onSave={onSave} />);

    const input = await screen.findByTestId("max-A1");
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("满分必须是正整数");
    // 失败时输入保留，不清空。
    expect(screen.getByTestId("max-A1")).toHaveValue(0);
  });

  it("读取失败时就地显示错误，不是整屏崩溃", async () => {
    const onLoad = vi.fn().mockRejectedValue(new Error("Unauthorized"));
    render(<RubricEditor courseId="c-1" onLoad={onLoad} onSave={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("读不出评分标准");
  });

  it("切换课程时重新拉取评分表", async () => {
    const onLoad = vi
      .fn()
      .mockResolvedValueOnce([{ item: "A1", max_score: 50 }])
      .mockResolvedValueOnce([{ item: "E1", max_score: null }]);
    const { rerender } = render(
      <RubricEditor courseId="c-1" onLoad={onLoad} onSave={vi.fn()} />,
    );
    await screen.findByTestId("max-A1");

    rerender(<RubricEditor courseId="c-2" onLoad={onLoad} onSave={vi.fn()} />);

    await screen.findByTestId("max-E1");
    expect(onLoad).toHaveBeenCalledWith("c-2");
  });
});
