import type { CompareDataModule, SpecRow, FilterGroup } from "@/components/HardwareCompare";

export interface CaseModel {
  id: string;
  brand: string;
  series: string;
  model: string;
  type: string;
  motherboardSupport: string;
  maxGpuLength: number;
  maxCpuCoolerHeight: number;
  maxPsuLength: number;
  driveBays: string;
  fanSupport: string;
  radiatorSupport: string;
  frontIO: string;
  sidePanel: string;
  weight: number;
  launchYear: number;
}

export const caseData: CaseModel[] = [
  { id: "o11devo", brand: "Lian Li", series: "O11 Dynamic", model: "O11 Dynamic EVO", type: "Mid Tower", motherboardSupport: "E-ATX / ATX / M-ATX / ITX", maxGpuLength: 422, maxCpuCoolerHeight: 167, maxPsuLength: 220, driveBays: "9x 2.5\", 2x 3.5\"", fanSupport: "10x 120mm", radiatorSupport: "Up to 3x 360mm", frontIO: "2x USB-A 3.0, 1x USB-C, Audio", sidePanel: "Tempered Glass", weight: 11.3, launchYear: 2021 },
  { id: "o11vision", brand: "Lian Li", series: "O11 Vision", model: "O11 Vision", type: "Mid Tower", motherboardSupport: "ATX / M-ATX / ITX", maxGpuLength: 455, maxCpuCoolerHeight: 167, maxPsuLength: 220, driveBays: "4x 2.5\", 2x 3.5\"", fanSupport: "8x 120mm", radiatorSupport: "Up to 2x 360mm", frontIO: "2x USB-A 3.0, 1x USB-C, Audio", sidePanel: "Tempered Glass (3 sides)", weight: 12.5, launchYear: 2023 },
  { id: "5000d", brand: "Corsair", series: "5000D", model: "5000D Airflow", type: "Mid Tower", motherboardSupport: "E-ATX / ATX / M-ATX / ITX", maxGpuLength: 420, maxCpuCoolerHeight: 170, maxPsuLength: 225, driveBays: "4x 2.5\", 2x 3.5\"", fanSupport: "10x 120mm", radiatorSupport: "Up to 3x 360mm", frontIO: "2x USB-A 3.0, 1x USB-C, Audio", sidePanel: "Tempered Glass", weight: 13.8, launchYear: 2021 },
  { id: "4000d", brand: "Corsair", series: "4000D", model: "4000D Airflow", type: "Mid Tower", motherboardSupport: "ATX / M-ATX / ITX", maxGpuLength: 360, maxCpuCoolerHeight: 170, maxPsuLength: 220, driveBays: "2x 2.5\", 2x 3.5\"", fanSupport: "6x 120mm", radiatorSupport: "Up to 1x 360mm + 1x 240mm", frontIO: "1x USB-A 3.0, 1x USB-C, Audio", sidePanel: "Tempered Glass", weight: 7.8, launchYear: 2020 },
  { id: "h7flow", brand: "NZXT", series: "H7", model: "H7 Flow", type: "Mid Tower", motherboardSupport: "ATX / M-ATX / ITX", maxGpuLength: 400, maxCpuCoolerHeight: 185, maxPsuLength: 200, driveBays: "2x 2.5\", 2x 3.5\"", fanSupport: "7x 120mm", radiatorSupport: "Up to 1x 360mm + 1x 360mm", frontIO: "2x USB-A 3.2, 1x USB-C, Audio", sidePanel: "Tempered Glass", weight: 10.1, launchYear: 2022 },
  { id: "h9flow", brand: "NZXT", series: "H9", model: "H9 Flow", type: "Mid Tower (Dual Chamber)", motherboardSupport: "ATX / M-ATX / ITX", maxGpuLength: 435, maxCpuCoolerHeight: 165, maxPsuLength: 200, driveBays: "4x 2.5\", 2x 3.5\"", fanSupport: "10x 120mm", radiatorSupport: "Up to 3x 360mm", frontIO: "2x USB-A 3.2, 1x USB-C, Audio", sidePanel: "Tempered Glass", weight: 12.1, launchYear: 2023 },
  { id: "h6flow", brand: "NZXT", series: "H6", model: "H6 Flow", type: "Mid Tower (Dual Chamber)", motherboardSupport: "ATX / M-ATX / ITX", maxGpuLength: 365, maxCpuCoolerHeight: 163, maxPsuLength: 200, driveBays: "2x 2.5\", 1x 3.5\"", fanSupport: "9x 120mm", radiatorSupport: "Up to 2x 360mm", frontIO: "2x USB-A 3.2, 1x USB-C, Audio", sidePanel: "Tempered Glass", weight: 8.4, launchYear: 2023 },
  { id: "torrent", brand: "Fractal Design", series: "Torrent", model: "Torrent", type: "Mid Tower", motherboardSupport: "E-ATX / ATX / M-ATX / ITX", maxGpuLength: 461, maxCpuCoolerHeight: 188, maxPsuLength: 230, driveBays: "4x 2.5\", 2x 3.5\"", fanSupport: "7x 120mm / 5x 140mm", radiatorSupport: "Up to 1x 420mm", frontIO: "2x USB-A 3.0, 1x USB-C, Audio", sidePanel: "Tempered Glass", weight: 10.4, launchYear: 2021 },
  { id: "north", brand: "Fractal Design", series: "North", model: "North", type: "Mid Tower", motherboardSupport: "ATX / M-ATX / ITX", maxGpuLength: 355, maxCpuCoolerHeight: 170, maxPsuLength: 205, driveBays: "2x 2.5\", 2x 3.5\"", fanSupport: "7x 120mm / 4x 140mm", radiatorSupport: "Up to 1x 360mm + 1x 240mm", frontIO: "2x USB-A 3.0, 1x USB-C, Audio", sidePanel: "Tempered Glass / Mesh", weight: 8.3, launchYear: 2022 },
  { id: "northxl", brand: "Fractal Design", series: "North", model: "North XL", type: "Mid Tower", motherboardSupport: "E-ATX / ATX / M-ATX / ITX", maxGpuLength: 413, maxCpuCoolerHeight: 185, maxPsuLength: 290, driveBays: "2x 2.5\", 2x 3.5\"", fanSupport: "9x 120mm / 6x 140mm", radiatorSupport: "Up to 1x 420mm + 1x 360mm", frontIO: "2x USB-A 3.0, 1x USB-C, Audio", sidePanel: "Tempered Glass", weight: 9.5, launchYear: 2024 },
  { id: "y60", brand: "HYTE", series: "Y60", model: "Y60", type: "Mid Tower", motherboardSupport: "ATX / M-ATX / ITX", maxGpuLength: 375, maxCpuCoolerHeight: 160, maxPsuLength: 235, driveBays: "2x 2.5\", 2x 3.5\"", fanSupport: "8x 120mm", radiatorSupport: "Up to 1x 360mm + 1x 280mm", frontIO: "2x USB-A 3.0, 1x USB-C, Audio", sidePanel: "Tempered Glass (3 sides)", weight: 9.5, launchYear: 2022 },
  { id: "y70", brand: "HYTE", series: "Y70", model: "Y70 Touch Infinite", type: "Mid Tower", motherboardSupport: "E-ATX / ATX / M-ATX / ITX", maxGpuLength: 422, maxCpuCoolerHeight: 180, maxPsuLength: 225, driveBays: "2x 2.5\", 2x 3.5\"", fanSupport: "10x 120mm", radiatorSupport: "Up to 3x 360mm", frontIO: "2x USB-A 3.0, 1x USB-C, Audio", sidePanel: "Tempered Glass + Touch Screen", weight: 14.5, launchYear: 2024 },
];

export const caseSpecRows: SpecRow<CaseModel>[] = [
  { key: "brand", label: "caseCompare.brand" },
  { key: "series", label: "caseCompare.series" },
  { key: "launchYear", label: "caseCompare.launchYear" },
  { key: "type", label: "caseCompare.type" },
  { key: "motherboardSupport", label: "caseCompare.motherboardSupport" },
  { key: "maxGpuLength", label: "caseCompare.maxGpuLength", format: (v) => `${v} mm` },
  { key: "maxCpuCoolerHeight", label: "caseCompare.maxCpuCoolerHeight", format: (v) => `${v} mm` },
  { key: "maxPsuLength", label: "caseCompare.maxPsuLength", format: (v) => `${v} mm` },
  { key: "driveBays", label: "caseCompare.driveBays" },
  { key: "fanSupport", label: "caseCompare.fanSupport" },
  { key: "radiatorSupport", label: "caseCompare.radiatorSupport" },
  { key: "frontIO", label: "caseCompare.frontIO" },
  { key: "sidePanel", label: "caseCompare.sidePanel" },
  { key: "weight", label: "caseCompare.weight", format: (v) => `${v} kg` },
];

export const caseFilterGroups: FilterGroup<CaseModel>[] = [
  { key: "brand", label: "caseCompare.brand" },
  { key: "series", label: "caseCompare.series" },
  { key: "type", label: "caseCompare.type" },
  { key: "motherboardSupport", label: "caseCompare.motherboardSupport" },
];

export const caseModule: CompareDataModule<CaseModel> = {
  data: caseData,
  specRows: caseSpecRows,
  filterGroups: caseFilterGroups,
  numericKeys: ["maxGpuLength", "maxCpuCoolerHeight", "maxPsuLength"],
  inverseKeys: ["weight"],
  i18nPrefix: "caseCompare",
};
