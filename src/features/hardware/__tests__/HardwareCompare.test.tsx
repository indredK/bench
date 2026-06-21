import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HardwareCompare from "@/features/hardware/HardwareCompare";
import { useHardwareCompareStore } from "@/features/hardware/store";
import type { CompareDataModule } from "@/shared/compare/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count != null ? `${key}:${options.count}` : key,
  }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/shared/compare/FilterBar", () => ({
  default: () => <div data-testid="filter-bar" />,
}));

vi.mock("@/shared/compare/CompareMatrixTable", () => ({
  CompareMatrixTable: () => <div data-testid="compare-matrix" />,
}));

const testModule: CompareDataModule<{ id: string; model: string; score: number }> = {
  data: [
    { id: "a", model: "Model A", score: 1 },
    { id: "b", model: "Model B", score: 2 },
  ],
  specRows: [{ key: "score", label: "hardware.score" }],
  numericKeys: ["score"],
  inverseKeys: [],
  i18nPrefix: "hardware.test",
  filterGroups: [{ key: "score", label: "hardware.score" }],
};

describe("HardwareCompare", () => {
  beforeEach(() => {
    useHardwareCompareStore.setState({
      selectedIdsByScope: {},
      filtersByScope: {},
    });
  });

  it("renders with empty scoped state without triggering selector update loops", () => {
    render(<HardwareCompare module={testModule} />);

    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
    expect(screen.getByText("hardwareCompare.noModelsSelected")).toBeInTheDocument();
  });

  it("renders compare table when scoped selections exist", () => {
    useHardwareCompareStore.setState({
      selectedIdsByScope: {
        "hardware.test": ["a", "b"],
      },
      filtersByScope: {},
    });

    render(<HardwareCompare module={testModule} />);

    expect(screen.getByTestId("compare-matrix")).toBeInTheDocument();
    expect(screen.getByText("hardware.test.comparingTitle:2")).toBeInTheDocument();
  });
});
