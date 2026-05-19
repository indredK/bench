import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import {
  StickyTable,
  StickyTableBody,
  StickyTableCaption,
  StickyTableCell,
  StickyTableCheckbox,
  StickyTableHead,
  StickyTableHeader,
  StickyTableRow,
  StickyTableSortButton,
  StickyTableText,
} from "../ui/StickyTable";

describe("StickyTable", () => {
  it("applies fixed layout when requested", () => {
    render(
      <StickyTable layout="fixed">
        <StickyTableHeader>
          <StickyTableRow>
            <StickyTableHead>Project</StickyTableHead>
          </StickyTableRow>
        </StickyTableHeader>
      </StickyTable>
    );

    expect(screen.getByRole("table")).toHaveClass("table-fixed");
  });

  it("supports indeterminate selection state", async () => {
    const checkboxRef = createRef<HTMLInputElement>();

    render(<StickyTableCheckbox ref={checkboxRef} indeterminate aria-label="Select row" />);

    await waitFor(() => {
      expect(checkboxRef.current?.indeterminate).toBe(true);
    });
  });

  it("renders shared sort and truncation helpers", () => {
    render(
      <StickyTable>
        <StickyTableCaption>Projects</StickyTableCaption>
        <StickyTableHeader>
          <StickyTableRow>
            <StickyTableHead>
              <StickyTableSortButton direction="desc">Project</StickyTableSortButton>
            </StickyTableHead>
          </StickyTableRow>
        </StickyTableHeader>
        <StickyTableBody>
          <StickyTableRow>
            <StickyTableCell>
              <StickyTableText title="/Users/apple/workspace/very/long/path">
                /.../workspace/very/long/path
              </StickyTableText>
            </StickyTableCell>
          </StickyTableRow>
        </StickyTableBody>
      </StickyTable>
    );

    expect(screen.getByRole("button", { name: "Project" })).toHaveTextContent("Project");
    expect(screen.getByText("/.../workspace/very/long/path")).toHaveClass("truncate");
  });
});
