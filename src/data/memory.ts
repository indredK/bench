import type { CompareDataModule, SpecRow } from "@/components/HardwareCompare";

export interface MemoryModel {
  id: string;
  brand: string;
  model: string;
  type: string;
  launchYear: number;
  capacity: number;
  speed: number;
  latency: string;
  voltage: number;
  modules: number;
  formFactor: string;
  rank: string;
  xmpProfile: string;
  ecc: string;
  hasHeatsink: string;
  hasRgb: string;
}

export const memoryData: MemoryModel[] = [
  { id: "vengeance64", brand: "Corsair", model: "Vengeance DDR5 64GB", type: "DDR5", launchYear: 2023, capacity: 64, speed: 6000, latency: "CL30-36-36-76", voltage: 1.4, modules: 2, formFactor: "DIMM", rank: "Dual Rank", xmpProfile: "Intel XMP 3.0", ecc: "No", hasHeatsink: "Yes", hasRgb: "No" },
  { id: "dominator64", brand: "Corsair", model: "Dominator Titanium 64GB", type: "DDR5", launchYear: 2024, capacity: 64, speed: 7200, latency: "CL34-42-42-96", voltage: 1.45, modules: 2, formFactor: "DIMM", rank: "Dual Rank", xmpProfile: "Intel XMP 3.0", ecc: "No", hasHeatsink: "Yes", hasRgb: "Yes" },
  { id: "trident32", brand: "G.Skill", model: "Trident Z5 RGB 32GB", type: "DDR5", launchYear: 2022, capacity: 32, speed: 6400, latency: "CL32-39-39-102", voltage: 1.4, modules: 2, formFactor: "DIMM", rank: "Single Rank", xmpProfile: "Intel XMP 3.0", ecc: "No", hasHeatsink: "Yes", hasRgb: "Yes" },
  { id: "trident64", brand: "G.Skill", model: "Trident Z5 Neo 64GB", type: "DDR5", launchYear: 2023, capacity: 64, speed: 6000, latency: "CL30-40-40-96", voltage: 1.35, modules: 2, formFactor: "DIMM", rank: "Dual Rank", xmpProfile: "AMD EXPO", ecc: "No", hasHeatsink: "Yes", hasRgb: "Yes" },
  { id: "fury32", brand: "Kingston", model: "Fury Beast DDR5 32GB", type: "DDR5", launchYear: 2023, capacity: 32, speed: 6000, latency: "CL36-38-38-80", voltage: 1.35, modules: 2, formFactor: "DIMM", rank: "Single Rank", xmpProfile: "Intel XMP 3.0", ecc: "No", hasHeatsink: "Yes", hasRgb: "No" },
  { id: "fury64", brand: "Kingston", model: "Fury Renegade 64GB", type: "DDR5", launchYear: 2024, capacity: 64, speed: 8000, latency: "CL38-48-48-128", voltage: 1.45, modules: 2, formFactor: "DIMM", rank: "Dual Rank", xmpProfile: "Intel XMP 3.0", ecc: "No", hasHeatsink: "Yes", hasRgb: "Yes" },
  { id: "pro32", brand: "Crucial", model: "DDR5 Pro 32GB", type: "DDR5", launchYear: 2023, capacity: 32, speed: 6000, latency: "CL36-38-38-80", voltage: 1.35, modules: 2, formFactor: "DIMM", rank: "Single Rank", xmpProfile: "Intel XMP 3.0 / AMD EXPO", ecc: "No", hasHeatsink: "Yes", hasRgb: "No" },
  { id: "ripjaws32", brand: "G.Skill", model: "Ripjaws S5 32GB", type: "DDR5", launchYear: 2022, capacity: 32, speed: 5600, latency: "CL28-34-34-89", voltage: 1.35, modules: 2, formFactor: "DIMM", rank: "Single Rank", xmpProfile: "Intel XMP 3.0", ecc: "No", hasHeatsink: "Yes", hasRgb: "No" },
  { id: "tdelta32", brand: "TeamGroup", model: "T-Force Delta 32GB", type: "DDR5", launchYear: 2023, capacity: 32, speed: 7200, latency: "CL34-42-42-84", voltage: 1.4, modules: 2, formFactor: "DIMM", rank: "Single Rank", xmpProfile: "Intel XMP 3.0", ecc: "No", hasHeatsink: "Yes", hasRgb: "Yes" },
  { id: "vengeanced4", brand: "Corsair", model: "Vengeance LPX DDR4 32GB", type: "DDR4", launchYear: 2020, capacity: 32, speed: 3600, latency: "CL18-22-22-42", voltage: 1.35, modules: 2, formFactor: "DIMM", rank: "Dual Rank", xmpProfile: "Intel XMP 2.0", ecc: "No", hasHeatsink: "Yes", hasRgb: "No" },
  { id: "ballistix32", brand: "Crucial", model: "Ballistix DDR4 32GB", type: "DDR4", launchYear: 2020, capacity: 32, speed: 3600, latency: "CL16-18-18-38", voltage: 1.35, modules: 2, formFactor: "DIMM", rank: "Single Rank", xmpProfile: "Intel XMP 2.0", ecc: "No", hasHeatsink: "Yes", hasRgb: "No" },
];

export const memorySpecRows: SpecRow<MemoryModel>[] = [
  { key: "brand", label: "memoryCompare.brand" },
  { key: "launchYear", label: "memoryCompare.launchYear" },
  { key: "type", label: "memoryCompare.type" },
  { key: "capacity", label: "memoryCompare.capacity", format: (v) => `${v} GB` },
  { key: "speed", label: "memoryCompare.speed", format: (v) => `${v} MT/s` },
  { key: "latency", label: "memoryCompare.latency" },
  { key: "voltage", label: "memoryCompare.voltage", format: (v) => `${v} V` },
  { key: "modules", label: "memoryCompare.modules" },
  { key: "formFactor", label: "memoryCompare.formFactor" },
  { key: "rank", label: "memoryCompare.rank" },
  { key: "xmpProfile", label: "memoryCompare.xmpProfile" },
  { key: "ecc", label: "memoryCompare.ecc" },
  { key: "hasHeatsink", label: "memoryCompare.hasHeatsink" },
  { key: "hasRgb", label: "memoryCompare.hasRgb" },
];

export const memoryModule: CompareDataModule<MemoryModel> = {
  data: memoryData,
  specRows: memorySpecRows,
  numericKeys: ["capacity", "speed"],
  inverseKeys: ["voltage"],
  i18nPrefix: "memoryCompare",
};