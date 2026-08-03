import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { ReportUploadDialog } from "./ReportUploadDialog";
import type { ReportPreview } from "./types";

function previewOf(over: Partial<ReportPreview> = {}): ReportPreview {
  return {
    items: [
      { code: "A1", score: 13, max: 15, comment: "分工清晰。", mismatch: false },
      { code: "A2", score: 6, max: 10, comment: "隐含文件传递。", mismatch: true },
    ],
    highlight: "报告亮点",
    improve: "报告改进建议",
    totalMismatch: false,
    ...over,
  };
}

function fileOf(name = "report.md"): File {
  return new File([new Uint8Array([0x61])], name, { type: "text/markdown" });
}

type Props = React.ComponentProps<typeof ReportUploadDialog>;

interface Handlers {
  onPreview: Mock;
  onApply: Mock;
  onClose: Mock;
}

function setup(handlers: Partial<Handlers> = {}) {
  const h: Handlers = {
    onPreview: vi.fn().mockResolvedValue({ ok: true, result: previewOf() }),
    onApply: vi.fn().mockResolvedValue({ ok: true, result: previewOf() }),
    onClose: vi.fn(),
    ...handlers,
  };
  render(
    <ReportUploadDialog
      file={fileOf()}
      submissionId="sub-alpha"
      personName="学员甲"
      onPreview={h.onPreview as Props["onPreview"]}
      onApply={h.onApply as Props["onApply"]}
      onClose={h.onClose as Props["onClose"]}
    />,
  );
  return h;
}

describe("ReportUploadDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("加载时预览一次，展示逐分项评语与亮点/改进建议", async () => {
    const h = setup();

    expect(await screen.findByText("分工清晰。")).toBeInTheDocument();
    expect(screen.getByText("报告亮点")).toBeInTheDocument();
    expect(screen.getByText("报告改进建议")).toBeInTheDocument();
    expect(h.onPreview).toHaveBeenCalledWith(expect.any(File), "sub-alpha");
  });

  it("勾选框默认全部勾选", async () => {
    setup();
    await screen.findByText("分工清晰。");

    const a1 = within(screen.getByTestId("report-item-A1")).getByRole("checkbox");
    const a2 = within(screen.getByTestId("report-item-A2")).getByRole("checkbox");
    expect(a1).toBeChecked();
    expect(a2).toBeChecked();
  });

  it("得分不一致的分项标警告徽章，但依然默认勾选（不阻止确认）", async () => {
    setup();
    await screen.findByText("分工清晰。");

    expect(screen.getByTestId("report-mismatch-A2")).toBeInTheDocument();
    expect(screen.queryByTestId("report-mismatch-A1")).toBeNull();
    expect(within(screen.getByTestId("report-item-A2")).getByRole("checkbox")).toBeChecked();
  });

  it("取消勾选某一项后确认，acceptedItems 不包含那一项", async () => {
    const h = setup();
    await screen.findByText("分工清晰。");
    const user = userEvent.setup();

    await user.click(within(screen.getByTestId("report-item-A2")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "确认导入" }));

    expect(h.onApply).toHaveBeenCalledWith(expect.any(File), "sub-alpha", ["A1"]);
  });

  it("确认成功后关闭对话框", async () => {
    const h = setup();
    await screen.findByText("分工清晰。");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "确认导入" }));

    expect(h.onClose).toHaveBeenCalled();
  });

  it("确认失败时就地显示错误，且对话框不关闭", async () => {
    const h = setup({
      onApply: vi.fn().mockResolvedValue({ ok: false, message: "导入没能完成，请确认还登录着，然后重试。" }),
    });
    await screen.findByText("分工清晰。");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "确认导入" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("导入没能完成");
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it("预览失败时就地显示错误，没有确认按钮", async () => {
    setup({ onPreview: vi.fn().mockResolvedValue({ ok: false, message: "读不出这份报告的预览，请确认还登录着，然后重试。" }) });

    expect(await screen.findByRole("alert")).toHaveTextContent("读不出这份报告的预览");
    expect(screen.queryByRole("button", { name: "确认导入" })).toBeNull();
  });

  it("点关闭调用 onClose", async () => {
    const h = setup();
    await screen.findByText("分工清晰。");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "关闭" }));

    expect(h.onClose).toHaveBeenCalled();
  });
});
