import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudentsClient } from "./StudentsClient";
import type { Student } from "./types";

const actions = vi.hoisted(() => ({
  updateStudentField: vi.fn(),
  createStudentAction: vi.fn(),
  archiveStudentAction: vi.fn(),
  restoreStudentAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

const student: Student = {
  name: "林敏",
  email: "lin.min@example.com",
  gender: "女",
  age: "25-30",
  industry: "留学 · 在读",
  wechat: "wx_linmin",
  nick: "敏敏",
  wxName: "Min Lin",
  source: "理财群",
  region: "美西",
  tz: "UTC-8",
  level: "小白",
  tags: ["新报名"],
  note: "",
};

/**
 * The detail-panel row for a field.
 *
 * Selected by `data-field` rather than by its visible label: the table header
 * carries the same Chinese labels, so a text query matches both and cannot
 * tell the roster column from the editable row.
 */
function fieldRow(field: string): HTMLElement {
  return document.querySelector(`[data-field="${field}"]`) as HTMLElement;
}

async function editField(field: string, value: string) {
  const user = userEvent.setup();
  await user.click(within(fieldRow(field)).getByRole("button"));
  const input = within(fieldRow(field)).getByRole("textbox");
  await user.clear(input);
  await user.type(input, `${value}{Enter}`);
  return user;
}

describe("saving a field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks only the field being saved as busy", async () => {
    // Editing one field costs one round trip. Locking the whole panel while it
    // is in flight makes filling in several fields in a row painful, so the
    // in-progress state has to stay scoped to its own row.
    actions.updateStudentField.mockReturnValue(new Promise(() => {}));

    render(<StudentsClient students={[student]} archivedStudents={[]} />);
    await editField("wechat", "wx_new");

    await waitFor(() => expect(fieldRow("wechat")).toHaveAttribute("aria-busy", "true"));
    expect(fieldRow("wxName")).not.toHaveAttribute("aria-busy", "true");
    expect(within(fieldRow("wxName")).getByRole("button")).toBeEnabled();
  });

  it("clears the busy state once the save lands", async () => {
    actions.updateStudentField.mockResolvedValue(undefined);

    render(<StudentsClient students={[student]} archivedStudents={[]} />);
    await editField("wechat", "wx_new");

    await waitFor(() =>
      expect(fieldRow("wechat")).not.toHaveAttribute("aria-busy", "true"),
    );
    expect(actions.updateStudentField).toHaveBeenCalledWith(student.email, {
      wechat: "wx_new",
    });
  });
});

describe("a field that fails to save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.updateStudentField.mockRejectedValue(new Error("boom"));
  });

  it("keeps what the user typed instead of reverting to the stored value", async () => {
    // The single most important behaviour in this change. The typed value is
    // newer than the stored one and usually much harder to obtain again — a
    // wechat handle takes a manual match against a group roster. Reverting on
    // failure would destroy the only copy of it.
    render(<StudentsClient students={[student]} archivedStudents={[]} />);
    await editField("wechat", "wx_hard_to_find");

    const row = await waitFor(() => {
      const el = fieldRow("wechat");
      expect(within(el).getByRole("textbox")).toBeInTheDocument();
      return el;
    });
    expect(within(row).getByRole("textbox")).toHaveValue("wx_hard_to_find");
    expect(within(row).queryByText("wx_linmin")).not.toBeInTheDocument();
  });

  it("shows the failure next to that field, not as a page-level message", async () => {
    render(<StudentsClient students={[student]} archivedStudents={[]} />);
    await editField("wechat", "wx_hard_to_find");

    const row = await waitFor(() => {
      const el = fieldRow("wechat");
      expect(within(el).getByText("没保存上。")).toBeInTheDocument();
      return el;
    });
    expect(within(row).getByRole("button", { name: "重试" })).toBeInTheDocument();
    // A neighbouring field stays clean — the message has to identify *which*
    // field failed, which a global toast cannot do.
    expect(within(fieldRow("wxName")).queryByText("没保存上。")).not.toBeInTheDocument();
  });

  it("retries with the value the user typed", async () => {
    const user = userEvent.setup();
    render(<StudentsClient students={[student]} archivedStudents={[]} />);
    await editField("wechat", "wx_hard_to_find");

    const retry = await waitFor(() =>
      within(fieldRow("wechat")).getByRole("button", { name: "重试" }),
    );
    actions.updateStudentField.mockClear();
    await user.click(retry);

    expect(actions.updateStudentField).toHaveBeenCalledWith(student.email, {
      wechat: "wx_hard_to_find",
    });
  });
});

describe("creating a student whose email belongs to an archived one", () => {
  const archived: Student = { ...student, email: "gone@example.com", name: "陈嘉禾" };

  beforeEach(() => {
    vi.clearAllMocks();
    // The action reports an expected refusal by returning it. Throwing cannot
    // work: Next.js redacts Server Action error messages in production builds,
    // so anything the client tried to read off `error.message` is gone by the
    // time it arrives — the classification would always fall through to the
    // generic branch, and only in production.
    actions.createStudentAction.mockResolvedValue({
      ok: false,
      kind: "archived",
      message: "email belongs to an archived student",
    });
  });

  async function submitNewStudent() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "新增学员" }));
    await user.type(screen.getByPlaceholderText("如 陈嘉禾"), "陈嘉禾");
    await user.type(screen.getByPlaceholderText("name@example.com"), archived.email);
    await user.click(screen.getByRole("button", { name: "保存" }));
    return user;
  }

  it("explains the collision and offers the archived view instead of creating", async () => {
    // Local duplicate detection only sees the in-study roster, so this
    // collision cannot be caught before submitting. Deliberately no auto
    // restore and no overwrite: the archived record's notes, tags and wechat
    // handle were expensive to collect, and taking them over silently to
    // satisfy a duplicate submission would destroy exactly that.
    render(<StudentsClient students={[student]} archivedStudents={[archived]} />);
    await submitNewStudent();

    expect(
      await screen.findByText(/该邮箱属于一位已归档的学员/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "前往「已归档」" }),
    ).toBeInTheDocument();
    expect(actions.restoreStudentAction).not.toHaveBeenCalled();
  });

  it("does not silently restore when the user follows the banner", async () => {
    render(<StudentsClient students={[student]} archivedStudents={[archived]} />);
    const user = await submitNewStudent();

    await user.click(
      await screen.findByRole("button", { name: "前往「已归档」" }),
    );

    // Landing in the archived view is navigation, not a write. Restoring is a
    // separate deliberate click on that record.
    expect(actions.restoreStudentAction).not.toHaveBeenCalled();
    // The archived student is now on screen; the in-study one is not.
    expect(screen.getAllByText(archived.email).length).toBeGreaterThan(0);
    expect(screen.queryByText(student.email)).not.toBeInTheDocument();
  });
});

describe("writes that are not plain text fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces a failed tag change instead of letting the pill snap back", async () => {
    // Tags go through the same save path as the text fields but have no row of
    // their own, so it is easy to end up with a write whose failure has
    // nowhere to appear — the pill reverts and nothing says why.
    actions.updateStudentField.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<StudentsClient students={[student]} archivedStudents={[]} />);

    await user.click(screen.getByRole("button", { name: "编辑" }));
    // Scoped to the tag block: the filter toolbar offers the same tag names,
    // where clicking one filters the roster instead of tagging this student.
    await user.click(within(fieldRow("tags")).getByRole("button", { name: "活跃" }));

    const tags = await waitFor(() => {
      const el = fieldRow("tags");
      expect(within(el).getByText("没保存上。")).toBeInTheDocument();
      return el;
    });
    expect(within(tags).getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("reports a failed archive rather than just re-enabling the button", async () => {
    actions.archiveStudentAction.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<StudentsClient students={[student]} archivedStudents={[]} />);

    await user.click(screen.getByRole("button", { name: "归档学员" }));
    await user.click(screen.getByRole("button", { name: "确认归档" }));

    expect(await screen.findByText("没归档成功。")).toBeInTheDocument();
    // The student is still selected and still in-study — nothing was hidden on
    // the strength of a write that did not land.
    expect(screen.getByRole("button", { name: "确认归档" })).toBeEnabled();
  });
});

describe("an enum field that fails to save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.updateStudentField.mockRejectedValue(new Error("boom"));
  });

  it("still lets the user choose a different value afterwards", async () => {
    // Enum fields have no free-text input to fall back on. If the failed state
    // renders instead of the picker, the only way out is a page reload — the
    // failure would take the field with it.
    const user = userEvent.setup();
    render(<StudentsClient students={[student]} archivedStudents={[]} />);

    await user.click(within(fieldRow("region")).getByRole("button"));
    await user.click(within(fieldRow("region")).getByRole("button", { name: "美东" }));
    await waitFor(() =>
      expect(within(fieldRow("region")).getByText("没保存上。")).toBeInTheDocument(),
    );

    // Back into the field: the picker must come up again.
    await user.click(within(fieldRow("region")).getByRole("textbox"));
    expect(
      within(fieldRow("region")).getByRole("button", { name: "加拿大" }),
    ).toBeInTheDocument();
  });
});

describe("in-progress state is visible, not only announced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.updateStudentField.mockReturnValue(new Promise(() => {}));
  });

  it("shows a spinner while a tag change is in flight", async () => {
    // aria-busy alone reaches assistive technology and nobody else. Tags and
    // the note are the two most-edited fields here, and they are also the two
    // that sit outside the field table — easy to leave without the treatment
    // every row in that table gets.
    const user = userEvent.setup();
    render(<StudentsClient students={[student]} archivedStudents={[]} />);

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(within(fieldRow("tags")).getByRole("button", { name: "活跃" }));

    await waitFor(() =>
      expect(within(fieldRow("tags")).getByTestId("saving-spinner")).toBeInTheDocument(),
    );
  });

  it("shows a spinner while the note is being saved", async () => {
    const user = userEvent.setup();
    render(<StudentsClient students={[student]} archivedStudents={[]} />);

    await user.click(within(fieldRow("note")).getByRole("button"));
    await user.type(within(fieldRow("note")).getByRole("textbox"), "写点东西");
    await user.tab();

    await waitFor(() =>
      expect(within(fieldRow("note")).getByTestId("saving-spinner")).toBeInTheDocument(),
    );
  });
});

describe("creating a student", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.createStudentAction.mockResolvedValue(undefined);
  });

  it("submits every field the form collected, not just the required ones", async () => {
    // The modal asks for a wechat handle, a wechat name, a nickname, tags and
    // a note. Dropping them on the way to the server means the one field that
    // costs a manual match against a group roster is silently discarded at the
    // exact moment it was easiest to record.
    const user = userEvent.setup();
    render(<StudentsClient students={[]} archivedStudents={[]} />);

    await user.click(screen.getByRole("button", { name: "新增学员" }));
    await user.type(screen.getByPlaceholderText("如 陈嘉禾"), "新同学");
    await user.type(screen.getByPlaceholderText("name@example.com"), "new@example.com");
    await user.type(screen.getByPlaceholderText("可留空"), "wx_new_student");
    await user.type(screen.getByPlaceholderText("用于比对"), "New Student");
    await user.type(screen.getByPlaceholderText("群里显示"), "小新");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(actions.createStudentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        name: "新同学",
        wechat: "wx_new_student",
        wxName: "New Student",
        nick: "小新",
      }),
    );
  });
});

describe("editing the name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits the name through the same per-field channel as every other field", async () => {
    // Imported records carry group-chat nicknames rather than real names.
    // Without this row the only correction was archive-and-recreate, which
    // discards the note — the least reproducible data in the system.
    actions.updateStudentField.mockResolvedValue(undefined);

    render(<StudentsClient students={[student]} archivedStudents={[]} />);
    await editField("name", "真名");

    await waitFor(() =>
      expect(actions.updateStudentField).toHaveBeenCalledWith(student.email, {
        name: "真名",
      }),
    );
  });

  it("keeps the typed name when the save fails", async () => {
    actions.updateStudentField.mockRejectedValue(new Error("boom"));

    render(<StudentsClient students={[student]} archivedStudents={[]} />);
    await editField("name", "改了一半");

    const row = await waitFor(() => {
      const el = fieldRow("name");
      expect(within(el).getByRole("textbox")).toBeInTheDocument();
      return el;
    });
    expect(within(row).getByRole("textbox")).toHaveValue("改了一半");
  });

  it("keeps the selection on the same email after a rename", async () => {
    // The list is ordered by name, so a rename moves the row. The selection is
    // keyed by email precisely so the detail panel does not follow the row
    // position and land on somebody else. Anyone switching it to an index
    // would break that silently.
    actions.updateStudentField.mockResolvedValue(undefined);
    const other: Student = { ...student, name: "阿甲", email: "jia@example.com" };

    render(<StudentsClient students={[other, student]} archivedStudents={[]} />);
    const user = userEvent.setup();
    await user.click(screen.getByText(student.name));
    await editField("name", "zzz 排到最后");

    await waitFor(() => expect(actions.updateStudentField).toHaveBeenCalled());
    expect(within(fieldRow("wechat")).getByText(student.wechat)).toBeInTheDocument();
  });
});
