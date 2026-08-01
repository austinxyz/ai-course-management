import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { ImportDialog } from "./ImportDialog";
import type { ImportResult } from "./types";

function resultOf(over: Partial<ImportResult> = {}): ImportResult {
  return {
    encoding: "utf-8",
    rowCount: 17,
    created: 0,
    updated: 16,
    autoCreated: [],
    skippedNoEnrollment: [],
    superseded: [],
    rowsWithoutEmail: [],
    excluded: [],
    rows: [{ email: "bravo@example.com", name: "学员乙", total: 77, action: "update" }],
    headerWarning: null,
    ...over,
  };
}

function fileOf(name = "grades.csv"): File {
  return new File([new Uint8Array([0x61, 0x62])], name, { type: "text/csv" });
}

type Props = React.ComponentProps<typeof ImportDialog>;

/**
 * 测试替身一律用 `Mock`，在 render 处再断言回真实的 prop 类型。
 *
 * 让 `vi.fn()` 直接顶到 prop 的函数类型上是过不了 tsc 的（`Mock` 的调用签名
 * 是宽的），而给每个替身写全签名会让"这个用例改的是哪个返回值"淹掉。
 */
interface Handlers {
  onPreview: Mock;
  onApply: Mock;
  onExclude: Mock;
  onClose: Mock;
}

function setup(handlers: Partial<Handlers> = {}) {
  // clearAllMocks 清调用记录但**不清实现**——每个用例显式给自己依赖的返回值，
  // 否则单独跑与全量跑会得到不同结果，而差异落在与本用例无关的断言上。
  const h: Handlers = {
    onPreview: vi.fn().mockResolvedValue({ ok: true, result: resultOf() }),
    onApply: vi.fn().mockResolvedValue({ ok: true, result: resultOf() }),
    onExclude: vi.fn().mockResolvedValue({ ok: true }),
    onClose: vi.fn(),
    ...handlers,
  };
  render(
    <ImportDialog
      file={fileOf()}
      courseId="c-1"
      courseName="从零开始用 Claude 和 Cowork"
      onPreview={h.onPreview as Props["onPreview"]}
      onApply={h.onApply as Props["onApply"]}
      onExclude={h.onExclude as Props["onExclude"]}
      onClose={h.onClose as Props["onClose"]}
    />,
  );
  return h;
}

/** 一个永远不 resolve 的 promise —— 用来把界面钉在"写入中"那一刻。 */
function hangs() {
  return new Promise<never>(() => {});
}

describe("ImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("预览屏", () => {
    it("显示编码、行数、将新建/将更新", async () => {
      setup();

      expect(await screen.findByText(/按 UTF-8 读取/)).toBeInTheDocument();
      const counts = screen.getByTestId("import-counts");
      expect(within(counts).getByTestId("count-created")).toHaveTextContent("0");
      expect(within(counts).getByTestId("count-updated")).toHaveTextContent("16");
    });

    it("两个数：将新建 / 将更新，不再有「将跳过」", async () => {
      // 自动建档的行现在**正常写入**，不再是"跳过"，所以没有第三个数字。
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({
            created: 1,
            updated: 16,
            autoCreated: ["new@example.com"],
            skippedNoEnrollment: ["noenroll@example.com"],
          }),
        }),
      });

      const counts = await screen.findByTestId("import-counts");
      expect(within(counts).getByTestId("count-created")).toHaveTextContent("1");
      expect(within(counts).getByTestId("count-updated")).toHaveTextContent("16");
      expect(screen.queryByTestId("count-skipped")).not.toBeInTheDocument();
    });

    it("行数说得出「少掉的那些去哪了」", async () => {
      // 只写「17 行」的话，源文件里明明是 18 行这件事就没人对得上账，
      // 而那个差额恰恰是最该被看见的东西。
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({
            rowCount: 17,
            superseded: ["session1/grades.csv:6"],
            rowsWithoutEmail: [],
          }),
        }),
      });

      expect(await screen.findByText(/共 18 行/)).toBeInTheDocument();
      expect(screen.getByText(/可用 17 行/)).toBeInTheDocument();
    });

    it("没有行被丢弃时不写那个箭头，只报一个数", async () => {
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({ rowCount: 17, superseded: [], rowsWithoutEmail: [] }),
        }),
      });

      await screen.findByRole("button", { name: /确认导入/ });
      expect(screen.queryByText(/→/)).toBeNull();
    });

    it("没有邮箱的行也计入原始行数", async () => {
      // 它们与重复提交是两种丢法，但都属于"源文件里有、这次没用上"。
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({
            rowCount: 15,
            superseded: ["s.csv:6"],
            rowsWithoutEmail: ["s.csv:9", "s.csv:11"],
          }),
        }),
      });

      expect(await screen.findByText(/共 18 行/)).toBeInTheDocument();
    });

    it("UTF-8 时也显示编码", async () => {
      // 只在异常时显示的话，用户永远不知道正常长什么样，
      // 也就无从判断这次是不是异常。
      setup();

      expect(await screen.findByText(/按 UTF-8 读取/)).toBeInTheDocument();
    });

    it("GBK 时提醒核对中文", async () => {
      // 解错编码**不报错**，只让亮点、改进建议与分项列名变成乱码，
      // 而覆盖式写入会把好数据盖掉。
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({ encoding: "gb18030" }),
        }),
      });

      expect(await screen.findByText(/按 GBK 读取/)).toBeInTheDocument();
      expect(screen.getByText(/请核对.*中文/)).toBeInTheDocument();
    });

    it("因重复提交被丢弃的行列出来", async () => {
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({ superseded: ["session1/grades.csv:6"] }),
        }),
      });

      expect(await screen.findByText(/session1\/grades\.csv:6/)).toBeInTheDocument();
    });

    it("自动建档与无报课记录**彼此分开**，中间隔着第二份的标题", async () => {
      // 含义不同：一类是本次新建的档案（讲师要回头核对占位信息），
      // 一类是已在册但没报这门课（要补报课）。合成一句"有 N 个人有问题"就无从下手。
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({
            autoCreated: ["new@example.com"],
            skippedNoEnrollment: ["nocourse@example.com"],
          }),
        }),
      });

      const autoCreated = await screen.findByTestId("auto-created");
      const noEnrollment = screen.getByTestId("skipped-no-enrollment");
      expect(within(autoCreated).getByText(/new@example\.com/)).toBeInTheDocument();
      expect(within(noEnrollment).getByText(/nocourse@example\.com/)).toBeInTheDocument();
    });

    it("自动建档面板说明这是占位信息，需要之后回填", async () => {
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({ autoCreated: ["new@example.com"] }),
        }),
      });

      const panel = await screen.findByTestId("auto-created");
      expect(within(panel).getByText(/自动建档/)).toBeInTheDocument();
      expect(screen.getByText(/回填/)).toBeInTheDocument();
    });

    it("界面上没有课程选择控件，但说得出导入到哪门课", async () => {
      setup();

      expect(
        await screen.findByText(/从零开始用 Claude 和 Cowork/),
      ).toBeInTheDocument();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  describe("确认", () => {
    it("确认按钮上写**具体条数**，不是「确认」", async () => {
      // 按钮上的数字是最后一道核对。写「确认」的话，
      // 用户点的是一个自己没复述过的动作。
      setup();

      const confirm = await screen.findByRole("button", { name: /确认导入 16 条/ });
      expect(confirm).toBeInTheDocument();
    });

    it("条数是将新建 + 将更新之和", async () => {
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({ created: 3, updated: 2 }),
        }),
      });

      expect(
        await screen.findByRole("button", { name: /确认导入 5 条/ }),
      ).toBeInTheDocument();
    });

    it("预览期间不写入——onApply 在用户确认前一次都没被调用", async () => {
      const h = setup();

      await screen.findByRole("button", { name: /确认导入/ });

      expect(h.onApply).not.toHaveBeenCalled();
    });

    it("点确认才写入，成功后才关闭", async () => {
      const h = setup();

      fireEvent.click(await screen.findByRole("button", { name: /确认导入/ }));

      await waitFor(() => expect(h.onApply).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(h.onClose).toHaveBeenCalled());
    });
  });

  describe("写入中", () => {
    it("**所有**出口都禁用，含取消", async () => {
      // 写入失败的信息渲染在这一屏上；中途关掉它就把失败信息一起带走了。
      // 用挂住不 resolve 的 promise 钉在写入中那一刻——只断言最终态的测试
      // 对这类回归全盲。
      setup({ onApply: vi.fn().mockImplementation(hangs) });

      fireEvent.click(await screen.findByRole("button", { name: /确认导入/ }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /取消/ })).toBeDisabled();
      });
      expect(screen.getByRole("button", { name: /导入中|确认导入/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /关闭/ })).toBeDisabled();
    });

    it("写入期间标记排除也停用——重算会盖掉正在写的这一屏", async () => {
      setup({ onApply: vi.fn().mockImplementation(hangs) });

      fireEvent.click(await screen.findByRole("button", { name: /确认导入/ }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /以后不算作业/ })).toBeDisabled();
      });
    });
  });

  describe("写入失败", () => {
    it("错误就地渲染，且预览屏**仍然打开**", async () => {
      // 承载错误的组件不能先于错误消失。
      const h = setup({
        onApply: vi.fn().mockResolvedValue({ ok: false, message: "表头与既有分项不符" }),
      });

      fireEvent.click(await screen.findByRole("button", { name: /确认导入/ }));

      expect(await screen.findByText(/表头与既有分项不符/)).toBeInTheDocument();
      expect(h.onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /确认导入/ })).toBeInTheDocument();
    });

    it("失败之后出口重新可用——不能把人锁死在这一屏", async () => {
      setup({
        onApply: vi.fn().mockResolvedValue({ ok: false, message: "写不进去" }),
      });

      fireEvent.click(await screen.findByRole("button", { name: /确认导入/ }));

      await screen.findByText(/写不进去/);
      expect(screen.getByRole("button", { name: /取消/ })).not.toBeDisabled();
    });

    it("预览**抛异常**时也说得出话，而不是整屏炸掉", async () => {
      // action 在鉴权失败时是**抛**的（被拒绝的写入不能读成"写了但没改动"）。
      // 站点密码过期、网络断了都会走到这条路。不接的话这是一个
      // useEffect 里的未处理 rejection——用户看到的是一片空白弹窗。
      setup({ onPreview: vi.fn().mockRejectedValue(new Error("Unauthorized")) });

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /确认导入/ })).not.toBeInTheDocument();
    });

    it("写入**抛异常**时留在这一屏，出口放开", async () => {
      setup({ onApply: vi.fn().mockRejectedValue(new Error("boom")) });

      fireEvent.click(await screen.findByRole("button", { name: /确认导入/ }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /取消/ })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /确认导入/ })).toBeInTheDocument();
    });

    it("标记排除**抛异常**时不把界面卡在写入中", async () => {
      // 卡在 writing 的话所有出口永久禁用，用户连取消都点不了，只能刷新。
      setup({ onExclude: vi.fn().mockRejectedValue(new Error("boom")) });

      await screen.findByRole("button", { name: /确认导入/ });
      fireEvent.click(screen.getByRole("button", { name: /以后不算作业/ }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /取消/ })).not.toBeDisabled();
    });

    it("预览本身失败时说清楚，且没有确认按钮可点", async () => {
      setup({
        onPreview: vi
          .fn()
          .mockResolvedValue({ ok: false, message: "这看起来不是作业成绩文件" }),
      });

      expect(await screen.findByText(/不是作业成绩文件/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /确认导入/ })).not.toBeInTheDocument();
    });
  });

  describe("标记「以后不算作业」", () => {
    it("标记后**重新请求一次预览**，数字来自第二次的返回值", async () => {
      // 前端自己加减会得出一个后端并不认同的数，
      // 而不一致只在写入之后才暴露。两次返回不同的值才分得出显示的是哪一个。
      const onPreview = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, result: resultOf({ created: 0, updated: 16 }) })
        .mockResolvedValueOnce({ ok: true, result: resultOf({ created: 0, updated: 9 }) });
      const h = setup({ onPreview });

      await screen.findByRole("button", { name: /确认导入 16 条/ });
      fireEvent.click(screen.getByRole("button", { name: /以后不算作业/ }));

      await waitFor(() => expect(h.onExclude).toHaveBeenCalledWith("bravo@example.com"));
      // 第二次预览请求确实发生了
      await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(2));
      // 且屏幕上的数字是第二次那个
      expect(
        await screen.findByRole("button", { name: /确认导入 9 条/ }),
      ).toBeInTheDocument();
    });

    it("重算期间出口仍然禁用——否则能标第二个人，两次重算的返回可以乱序", async () => {
      // 标记之后要重新请求一次预览。如果这段时间把按钮放开，用户可以再点一个人，
      // 于是两个 dry-run 同时在飞；先发的后回时，屏幕上留下的是**旧的**数字，
      // 而确认按钮上那个数正是用户要核对的东西。
      // 用挂住不 resolve 的第二次预览把界面钉在重算中那一刻。
      const onPreview = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, result: resultOf() })
        .mockImplementationOnce(hangs);
      setup({ onPreview });

      await screen.findByRole("button", { name: /确认导入/ });
      fireEvent.click(screen.getByRole("button", { name: /以后不算作业/ }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /以后不算作业/ })).toBeDisabled();
      });
      expect(screen.getByRole("button", { name: /取消/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /关闭/ })).toBeDisabled();
    });

    it("标记失败时清掉上一条错误，不让两条错误叠在一起读", async () => {
      const onApply = vi.fn().mockResolvedValue({ ok: false, message: "写入那次的错" });
      const onExclude = vi.fn().mockResolvedValue({ ok: false, message: "标记这次的错" });
      setup({ onApply, onExclude });

      fireEvent.click(await screen.findByRole("button", { name: /确认导入/ }));
      await screen.findByText(/写入那次的错/);

      fireEvent.click(screen.getByRole("button", { name: /以后不算作业/ }));

      expect(await screen.findByText(/标记这次的错/)).toBeInTheDocument();
      expect(screen.queryByText(/写入那次的错/)).toBeNull();
    });

    it("已排除的邮箱显示为已排除", async () => {
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({ excluded: ["teacher@example.com"], rows: [] }),
        }),
      });

      const excluded = await screen.findByTestId("excluded-list");
      expect(within(excluded).getByText(/teacher@example\.com/)).toBeInTheDocument();
    });
  });

  describe("表头警告", () => {
    it("列出两边列名，且确认按钮**仍然可用**", async () => {
      // 直接拒绝会在课程真的改了评分表时卡死，而改评分表是合法的。
      setup({
        onPreview: vi.fn().mockResolvedValue({
          ok: true,
          result: resultOf({
            headerWarning: {
              fileItems: ["E1领域与结构", "G2心得深度"],
              existingItems: ["A1工作流结构", "D2心得深度"],
            },
          }),
        }),
      });

      const warning = await screen.findByTestId("header-warning");
      expect(within(warning).getByText(/E1领域与结构/)).toBeInTheDocument();
      expect(within(warning).getByText(/A1工作流结构/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /确认导入/ })).not.toBeDisabled();
    });

    it("没有警告时不渲染那一块", async () => {
      setup();

      await screen.findByRole("button", { name: /确认导入/ });
      expect(screen.queryByTestId("header-warning")).not.toBeInTheDocument();
    });
  });
});
