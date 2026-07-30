import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EnrollPage from "./enroll/page";
import HomeworkPage from "./homework/page";
import InteractionsPage from "./interactions/page";
import NudgePage from "./nudge/page";

/**
 * The four unbuilt sections each own a route now.
 *
 * They used to be branches inside StudentsClient, reached by setting view
 * state. Routes keep the roster component from being the place every future
 * section has to be added, and they make "报课 is still a placeholder" a fact
 * about a URL rather than about one component's state.
 */
describe("placeholder routes", () => {
  it.each([
    ["报课", EnrollPage],
    ["作业", HomeworkPage],
    ["催作业", NudgePage],
    ["互动记录", InteractionsPage],
  ])("%s renders its placeholder page", (title, Page) => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText("未开始设计")).toBeInTheDocument();
  });

  it("offers a way back to the roster as a link", () => {
    render(<EnrollPage />);

    expect(screen.getByRole("link", { name: "返回学员名单" })).toHaveAttribute(
      "href",
      "/students",
    );
  });
});
