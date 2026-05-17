import type { CompareDataModule, SpecRow } from "@/components/HardwareCompare";

export interface CpuModel {
  id: string;
  brand: string;
  model: string;
  cores: number;
  threads: number;
  baseClock: number;
  boostClock: number;
  tdp: number;
  socket: string;
  architecture: string;
  processNode: number;
  l3Cache: number;
  integratedGpu: string;
  memorySupport: string;
  pcieVersion: string;
  launchYear: number;
}

export const cpuData: CpuModel[] = [
  { id: "14900k", brand: "Intel", model: "Core i9-14900K", cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.0, tdp: 125, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", pcieVersion: "5.0", launchYear: 2023 },
  { id: "13900k", brand: "Intel", model: "Core i9-13900K", cores: 24, threads: 32, baseClock: 3.0, boostClock: 5.8, tdp: 125, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", pcieVersion: "5.0", launchYear: 2022 },
  { id: "14700k", brand: "Intel", model: "Core i7-14700K", cores: 20, threads: 28, baseClock: 3.4, boostClock: 5.6, tdp: 125, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l3Cache: 33, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", pcieVersion: "5.0", launchYear: 2023 },
  { id: "14600k", brand: "Intel", model: "Core i5-14600K", cores: 14, threads: 20, baseClock: 3.5, boostClock: 5.3, tdp: 125, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l3Cache: 24, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", pcieVersion: "5.0", launchYear: 2023 },
  { id: "285k", brand: "Intel", model: "Core Ultra 9 285K", cores: 24, threads: 24, baseClock: 3.7, boostClock: 5.7, tdp: 125, socket: "LGA1851", architecture: "Arrow Lake", processNode: 3, l3Cache: 36, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", pcieVersion: "5.0", launchYear: 2024 },
  { id: "7950x", brand: "AMD", model: "Ryzen 9 7950X", cores: 16, threads: 32, baseClock: 4.5, boostClock: 5.7, tdp: 170, socket: "AM5", architecture: "Zen 4", processNode: 5, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", pcieVersion: "5.0", launchYear: 2022 },
  { id: "9950x", brand: "AMD", model: "Ryzen 9 9950X", cores: 16, threads: 32, baseClock: 4.3, boostClock: 5.7, tdp: 170, socket: "AM5", architecture: "Zen 5", processNode: 4, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", pcieVersion: "5.0", launchYear: 2024 },
  { id: "7800x3d", brand: "AMD", model: "Ryzen 7 7800X3D", cores: 8, threads: 16, baseClock: 4.2, boostClock: 5.0, tdp: 120, socket: "AM5", architecture: "Zen 4 3D V-Cache", processNode: 5, l3Cache: 96, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", pcieVersion: "5.0", launchYear: 2023 },
  { id: "9800x3d", brand: "AMD", model: "Ryzen 7 9800X3D", cores: 8, threads: 16, baseClock: 4.7, boostClock: 5.2, tdp: 120, socket: "AM5", architecture: "Zen 5 3D V-Cache", processNode: 4, l3Cache: 96, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", pcieVersion: "5.0", launchYear: 2024 },
  { id: "m2ultra", brand: "Apple", model: "M2 Ultra", cores: 24, threads: 24, baseClock: 3.5, boostClock: 3.5, tdp: 60, socket: "Apple SoC", architecture: "Apple M2 Ultra", processNode: 5, l3Cache: 96, integratedGpu: "76-core GPU", memorySupport: "LPDDR5-6400", pcieVersion: "4.0", launchYear: 2023 },
  { id: "m3max", brand: "Apple", model: "M3 Max", cores: 16, threads: 16, baseClock: 4.05, boostClock: 4.05, tdp: 45, socket: "Apple SoC", architecture: "Apple M3 Max", processNode: 3, l3Cache: 48, integratedGpu: "40-core GPU", memorySupport: "LPDDR5-6400", pcieVersion: "4.0", launchYear: 2023 },
];

export const cpuSpecRows: SpecRow<CpuModel>[] = [
  { key: "brand", label: "cpuCompare.brand" },
  { key: "launchYear", label: "cpuCompare.launchYear" },
  { key: "architecture", label: "cpuCompare.architecture" },
  { key: "processNode", label: "cpuCompare.processNode", format: (v) => `${v} nm` },
  { key: "cores", label: "cpuCompare.cores" },
  { key: "threads", label: "cpuCompare.threads" },
  { key: "baseClock", label: "cpuCompare.baseClock", format: (v) => `${v} GHz` },
  { key: "boostClock", label: "cpuCompare.boostClock", format: (v) => `${v} GHz` },
  { key: "tdp", label: "cpuCompare.tdp", format: (v) => `${v} W` },
  { key: "l3Cache", label: "cpuCompare.l3Cache", format: (v) => `${v} MB` },
  { key: "socket", label: "cpuCompare.socket" },
  { key: "memorySupport", label: "cpuCompare.memorySupport" },
  { key: "pcieVersion", label: "cpuCompare.pcieVersion" },
  { key: "integratedGpu", label: "cpuCompare.integratedGpu" },
];

export const cpuModule: CompareDataModule<CpuModel> = {
  data: cpuData,
  specRows: cpuSpecRows,
  numericKeys: ["cores", "threads", "baseClock", "boostClock", "l3Cache"],
  inverseKeys: ["tdp", "processNode"],
  i18nPrefix: "cpuCompare",
};