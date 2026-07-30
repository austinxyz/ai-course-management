import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "./Sidebar";

const pathname = vi.hoisted(() => ({ current: "/students" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

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
    pathname.current = "/students";
    render(<Sidebar studentCount={10} />);

    expect(screen.getByRole("link", { name: /学员/ })).toHaveAttribute("href", "/students");
    expect(screen.getByRole("link", { name: /课程/ })).toHaveAttribute("href", "/courses");
    expect(screen.getByRole("link", { name: /报课/ })).toHaveAttribute("href", "/enroll");
  });

  /**
   * Highlight is derived from the route, never passed in and never held as
   * state. A prop would let a page claim a section it isn't on; state could
   * drift from the URL after a back/forward. The route IS the answer.
   */
  it("marks the section matching the current route, with no prop passed", () => {
    pathname.current = "/courses";
    render(<Sidebar studentCount={10} />);

    expect(screen.getByRole("link", { name: /课程/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /学员/ })).not.toHaveAttribute("aria-current");
  });

  /**
   * `—` is the placeholder for "not counted", and it covers two cases that mean
   * the same thing: a page that never fetches the roster, and a count still in
   * flight behind its Suspense boundary. Neither may claim 0 — a page that
   * never counted must not assert there are none.
   */
  it("shows — rather than 0 when no count was supplied", () => {
    pathname.current = "/enroll";
    render(<Sidebar />);

    const students = screen.getByRole("link", { name: /学员/ });
    expect(students).toHaveTextContent("—");
    expect(students).not.toHaveTextContent("0");
  });

  it("follows the route when it changes", () => {
    pathname.current = "/enroll";
    render(<Sidebar studentCount={10} />);

    expect(screen.getByRole("link", { name: /报课/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /课程/ })).not.toHaveAttribute("aria-current");
  });
});
