import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sidebar } from "./Sidebar";

/**
 * The sidebar navigates between pages, so its entries have to be links.
 *
 * They used to be buttons calling setView inside StudentsClient, which meant
 * every section lived in that one component. The course page would have made it
 * hold two datasets at once, and rendering the roster would have queried the
 * course tables. Links let each section own its own route and its own fetch.
 */
describe("Sidebar", () => {
  it("renders each section as a link to its route", () => {
    render(<Sidebar active="students" studentCount={10} />);

    expect(screen.getByRole("link", { name: /学员/ })).toHaveAttribute("href", "/students");
    expect(screen.getByRole("link", { name: /课程/ })).toHaveAttribute("href", "/courses");
    expect(screen.getByRole("link", { name: /报课/ })).toHaveAttribute("href", "/enroll");
  });

  it("marks the active section", () => {
    render(<Sidebar active="courses" studentCount={10} />);

    const courses = screen.getByRole("link", { name: /课程/ });
    expect(courses).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /学员/ })).not.toHaveAttribute("aria-current");
  });
});
