import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../ui/DataTable";

interface ProjectRow {
  id: string;
  name: string;
  path: string;
}

const columns: ColumnDef<ProjectRow>[] = [
  {
    id: "name",
    header: "Name",
    accessorKey: "name",
    meta: {
      width: "30%",
    },
  },
  {
    id: "path",
    header: "Path",
    accessorKey: "path",
    meta: {
      width: "70%",
    },
  },
];

describe("DataTable", () => {
  it("renders body rows directly so table columns share one layout", () => {
    const { container } = render(
      <DataTable
        data={[
          { id: "1", name: "alpha", path: "/opt/homebrew/bin/alpha" },
          { id: "2", name: "beta", path: "/usr/bin/beta" },
        ]}
        columns={columns}
        getRowId={(row) => row.id}
        layout="fixed"
      />
    );

    const body = container.querySelector("tbody");
    expect(body).not.toBeNull();
    expect(Array.from(body?.children ?? []).map((child) => child.tagName)).toEqual([
      "TR",
      "TR",
    ]);
  });
});
