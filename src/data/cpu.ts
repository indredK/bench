import type { CompareDataModule, SpecRow, FilterGroup } from "@/components/HardwareCompare";

export interface CpuModel {
  id: string;
  brand: string;
  series: string;
  model: string;
  cores: number;
  threads: number;
  baseClock: number;
  boostClock: number;
  tdp: number;
  maxTurboPower?: number;
  socket: string;
  architecture: string;
  processNode: number;
  l2Cache: number;
  l3Cache: number;
  integratedGpu: string;
  memorySupport: string;
  memoryChannels: number;
  pcieVersion: string;
  launchYear: number;
  price?: number;
}

export const cpuData: CpuModel[] = [
  // ══════════════════════════════════════════════════
  // Intel — 12th Gen Alder Lake
  // ══════════════════════════════════════════════════
  { id: "12900k", brand: "Intel", series: "Core i9",  model: "Core i9-12900K", cores: 16, threads: 24, baseClock: 3.2, boostClock: 5.2, tdp: 125, maxTurboPower: 241, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 14, l3Cache: 30, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2021, price: 350 },
  { id: "12700k", brand: "Intel", series: "Core i7",  model: "Core i7-12700K", cores: 12, threads: 20, baseClock: 3.6, boostClock: 5.0, tdp: 125, maxTurboPower: 190, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 12, l3Cache: 25, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2021, price: 280 },
  { id: "12600k", brand: "Intel", series: "Core i5",  model: "Core i5-12600K", cores: 10, threads: 16, baseClock: 3.7, boostClock: 4.9, tdp: 125, maxTurboPower: 150, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 10, l3Cache: 20, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2021, price: 200 },
  { id: "12400",  brand: "Intel", series: "Core i5",  model: "Core i5-12400", cores: 6, threads: 12, baseClock: 2.5, boostClock: 4.4, tdp: 65, maxTurboPower: 117, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 8, l3Cache: 18, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 150 },
  { id: "12100",  brand: "Intel", series: "Core i3",  model: "Core i3-12100", cores: 4, threads: 8, baseClock: 3.3, boostClock: 4.3, tdp: 60, maxTurboPower: 89, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 5, l3Cache: 12, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 100 },

  // ══════════════════════════════════════════════════
  // Intel — 13th Gen Raptor Lake
  // ══════════════════════════════════════════════════
  { id: "13900k", brand: "Intel", series: "Core i9",  model: "Core i9-13900K", cores: 24, threads: 32, baseClock: 3.0, boostClock: 5.8, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 400 },
  { id: "13900kf", brand: "Intel", series: "Core i9",  model: "Core i9-13900KF", cores: 24, threads: 32, baseClock: 3.0, boostClock: 5.8, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 380 },
  { id: "13900ks", brand: "Intel", series: "Core i9",  model: "Core i9-13900KS", cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.0, tdp: 150, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 699 },
  { id: "13700k", brand: "Intel", series: "Core i7",  model: "Core i7-13700K", cores: 16, threads: 24, baseClock: 3.4, boostClock: 5.4, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 24, l3Cache: 30, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 320 },
  { id: "13700kf", brand: "Intel", series: "Core i7",  model: "Core i7-13700KF", cores: 16, threads: 24, baseClock: 3.4, boostClock: 5.4, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 24, l3Cache: 30, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 300 },
  { id: "13600k", brand: "Intel", series: "Core i5",  model: "Core i5-13600K", cores: 14, threads: 20, baseClock: 3.5, boostClock: 5.1, tdp: 125, maxTurboPower: 181, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 250 },
  { id: "13600kf", brand: "Intel", series: "Core i5",  model: "Core i5-13600KF", cores: 14, threads: 20, baseClock: 3.5, boostClock: 5.1, tdp: 125, maxTurboPower: 181, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 230 },
  { id: "13500",  brand: "Intel", series: "Core i5",  model: "Core i5-13500", cores: 14, threads: 20, baseClock: 2.5, boostClock: 4.8, tdp: 65, maxTurboPower: 154, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 230 },
  { id: "13400",  brand: "Intel", series: "Core i5",  model: "Core i5-13400", cores: 10, threads: 16, baseClock: 2.5, boostClock: 4.6, tdp: 65, maxTurboPower: 148, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 12, l3Cache: 20, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 190 },
  { id: "13400f", brand: "Intel", series: "Core i5",  model: "Core i5-13400F", cores: 10, threads: 16, baseClock: 2.5, boostClock: 4.6, tdp: 65, maxTurboPower: 148, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 12, l3Cache: 20, integratedGpu: "None", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 170 },
  { id: "13100",  brand: "Intel", series: "Core i3",  model: "Core i3-13100", cores: 4, threads: 8, baseClock: 3.4, boostClock: 4.5, tdp: 60, maxTurboPower: 89, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 5, l3Cache: 12, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 134 },

  // ══════════════════════════════════════════════════
  // Intel — 14th Gen Raptor Lake Refresh
  // ══════════════════════════════════════════════════
  { id: "14900k", brand: "Intel", series: "Core i9",  model: "Core i9-14900K", cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.0, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 450 },
  { id: "14900kf", brand: "Intel", series: "Core i9",  model: "Core i9-14900KF", cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.0, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 430 },
  { id: "14900ks", brand: "Intel", series: "Core i9",  model: "Core i9-14900KS", cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.2, tdp: 150, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 699 },
  { id: "14700k", brand: "Intel", series: "Core i7",  model: "Core i7-14700K", cores: 20, threads: 28, baseClock: 3.4, boostClock: 5.6, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 28, l3Cache: 33, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 368 },
  { id: "14700kf", brand: "Intel", series: "Core i7",  model: "Core i7-14700KF", cores: 20, threads: 28, baseClock: 3.4, boostClock: 5.6, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 28, l3Cache: 33, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 340 },
  { id: "14600k", brand: "Intel", series: "Core i5",  model: "Core i5-14600K", cores: 14, threads: 20, baseClock: 3.5, boostClock: 5.3, tdp: 125, maxTurboPower: 181, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 200 },
  { id: "14600kf", brand: "Intel", series: "Core i5",  model: "Core i5-14600KF", cores: 14, threads: 20, baseClock: 3.5, boostClock: 5.3, tdp: 125, maxTurboPower: 181, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 180 },
  { id: "14400",  brand: "Intel", series: "Core i5",  model: "Core i5-14400", cores: 10, threads: 16, baseClock: 2.5, boostClock: 4.7, tdp: 65, maxTurboPower: 148, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 12, l3Cache: 20, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 170 },
  { id: "14400f", brand: "Intel", series: "Core i5",  model: "Core i5-14400F", cores: 10, threads: 16, baseClock: 2.5, boostClock: 4.7, tdp: 65, maxTurboPower: 148, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 12, l3Cache: 20, integratedGpu: "None", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 150 },
  { id: "14100",  brand: "Intel", series: "Core i3",  model: "Core i3-14100", cores: 4, threads: 8, baseClock: 3.5, boostClock: 4.7, tdp: 60, maxTurboPower: 89, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 5, l3Cache: 12, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 100 },

  // ══════════════════════════════════════════════════
  // Intel — Core Ultra 200S (Arrow Lake / Arrow Lake Refresh)
  // ══════════════════════════════════════════════════
  { id: "285k",    brand: "Intel", series: "Core Ultra 9", model: "Core Ultra 9 285K", cores: 24, threads: 24, baseClock: 3.7, boostClock: 5.7, tdp: 125, maxTurboPower: 250, socket: "LGA1851", architecture: "Arrow Lake", processNode: 3, l2Cache: 36, l3Cache: 36, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 549 },
  { id: "270kplus", brand: "Intel", series: "Core Ultra 7", model: "Core Ultra 7 270K Plus", cores: 24, threads: 24, baseClock: 3.7, boostClock: 5.5, tdp: 125, maxTurboPower: 250, socket: "LGA1851", architecture: "Arrow Lake Refresh", processNode: 3, l2Cache: 36, l3Cache: 36, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2025, price: 279 },
  { id: "265k",    brand: "Intel", series: "Core Ultra 7", model: "Core Ultra 7 265K", cores: 20, threads: 20, baseClock: 3.9, boostClock: 5.5, tdp: 125, maxTurboPower: 250, socket: "LGA1851", architecture: "Arrow Lake", processNode: 3, l2Cache: 33, l3Cache: 30, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 319 },
  { id: "250kplus", brand: "Intel", series: "Core Ultra 5", model: "Core Ultra 5 250K Plus", cores: 18, threads: 18, baseClock: 4.2, boostClock: 5.3, tdp: 125, maxTurboPower: 250, socket: "LGA1851", architecture: "Arrow Lake Refresh", processNode: 3, l2Cache: 27, l3Cache: 30, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2025, price: 200 },
  { id: "245k",    brand: "Intel", series: "Core Ultra 5", model: "Core Ultra 5 245K", cores: 14, threads: 14, baseClock: 4.2, boostClock: 5.2, tdp: 125, maxTurboPower: 159, socket: "LGA1851", architecture: "Arrow Lake", processNode: 3, l2Cache: 24, l3Cache: 24, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 240 },

  // ══════════════════════════════════════════════════
  // AMD — Ryzen 5000 Series (Zen 3, AM4)
  // ══════════════════════════════════════════════════
  { id: "5950x",   brand: "AMD", series: "Ryzen 9",  model: "Ryzen 9 5950X", cores: 16, threads: 32, baseClock: 3.4, boostClock: 4.9, tdp: 105, maxTurboPower: 142, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 8, l3Cache: 64, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2020, price: 400 },
  { id: "5900x",   brand: "AMD", series: "Ryzen 9",  model: "Ryzen 9 5900X", cores: 12, threads: 24, baseClock: 3.7, boostClock: 4.8, tdp: 105, maxTurboPower: 142, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 6, l3Cache: 64, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2020, price: 300 },
  { id: "5800x3d", brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 5800X3D", cores: 8, threads: 16, baseClock: 3.4, boostClock: 4.5, tdp: 105, maxTurboPower: 142, socket: "AM4", architecture: "Zen 3 3D V-Cache", processNode: 7, l2Cache: 4, l3Cache: 96, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2022, price: 280 },
  { id: "5700x3d", brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 5700X3D", cores: 8, threads: 16, baseClock: 3.0, boostClock: 4.1, tdp: 105, maxTurboPower: 142, socket: "AM4", architecture: "Zen 3 3D V-Cache", processNode: 7, l2Cache: 4, l3Cache: 96, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2024, price: 200 },
  { id: "5700x",   brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 5700X", cores: 8, threads: 16, baseClock: 3.4, boostClock: 4.6, tdp: 65, maxTurboPower: 88, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 4, l3Cache: 32, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2022, price: 180 },
  { id: "5600",    brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 5600", cores: 6, threads: 12, baseClock: 3.5, boostClock: 4.4, tdp: 65, maxTurboPower: 88, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 3, l3Cache: 32, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2022, price: 135 },
  { id: "5600x",   brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 5600X", cores: 6, threads: 12, baseClock: 3.7, boostClock: 4.6, tdp: 65, maxTurboPower: 88, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 3, l3Cache: 32, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2020, price: 150 },

  // ══════════════════════════════════════════════════
  // AMD — Ryzen 7000 Series (Zen 4, AM5)
  // ══════════════════════════════════════════════════
  { id: "7950x",   brand: "AMD", series: "Ryzen 9",  model: "Ryzen 9 7950X", cores: 16, threads: 32, baseClock: 4.5, boostClock: 5.7, tdp: 170, maxTurboPower: 230, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 16, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 501 },
  { id: "7900x",   brand: "AMD", series: "Ryzen 9",  model: "Ryzen 9 7900X", cores: 12, threads: 24, baseClock: 4.7, boostClock: 5.6, tdp: 170, maxTurboPower: 230, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 12, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 380 },
  { id: "7700x",   brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 7700X", cores: 8, threads: 16, baseClock: 4.5, boostClock: 5.4, tdp: 105, maxTurboPower: 142, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 8, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 280 },
  { id: "7800x3d", brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 7800X3D", cores: 8, threads: 16, baseClock: 4.2, boostClock: 5.0, tdp: 120, maxTurboPower: 162, socket: "AM5", architecture: "Zen 4 3D V-Cache", processNode: 5, l2Cache: 8, l3Cache: 96, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 324 },
  { id: "7500f",   brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 7500F", cores: 6, threads: 12, baseClock: 3.7, boostClock: 5.0, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 6, l3Cache: 32, integratedGpu: "None", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 140 },
  { id: "7600x",   brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 7600X", cores: 6, threads: 12, baseClock: 4.7, boostClock: 5.3, tdp: 105, maxTurboPower: 142, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 6, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 160 },
  { id: "7600",    brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 7600", cores: 6, threads: 12, baseClock: 3.8, boostClock: 5.1, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 6, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 150 },

  // ══════════════════════════════════════════════════
  // AMD — Ryzen 8000G Series (Zen 4, AM5 APU)
  // ══════════════════════════════════════════════════
  { id: "8700g",   brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 8700G", cores: 8, threads: 16, baseClock: 4.2, boostClock: 5.1, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 4", processNode: 4, l2Cache: 8, l3Cache: 16, integratedGpu: "Radeon 780M (12 CU)", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2024, price: 280 },
  { id: "8600g",   brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 8600G", cores: 6, threads: 12, baseClock: 4.3, boostClock: 5.0, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 4", processNode: 4, l2Cache: 6, l3Cache: 16, integratedGpu: "Radeon 760M (8 CU)", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2024, price: 200 },

  // ══════════════════════════════════════════════════
  // AMD — Ryzen 9000 Series (Zen 5, AM5)
  // ══════════════════════════════════════════════════
  { id: "9950x",    brand: "AMD", series: "Ryzen 9", model: "Ryzen 9 9950X", cores: 16, threads: 32, baseClock: 4.3, boostClock: 5.7, tdp: 170, maxTurboPower: 230, socket: "AM5", architecture: "Zen 5", processNode: 4, l2Cache: 16, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 499 },
  { id: "9950x3d",  brand: "AMD", series: "Ryzen 9", model: "Ryzen 9 9950X3D", cores: 16, threads: 32, baseClock: 4.3, boostClock: 5.7, tdp: 170, maxTurboPower: 230, socket: "AM5", architecture: "Zen 5 3D V-Cache", processNode: 4, l2Cache: 16, l3Cache: 128, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2025, price: 639 },
  { id: "9950x3d2", brand: "AMD", series: "Ryzen 9", model: "Ryzen 9 9950X3D2", cores: 16, threads: 32, baseClock: 4.3, boostClock: 5.7, tdp: 200, socket: "AM5", architecture: "Zen 5 Dual 3D V-Cache", processNode: 4, l2Cache: 16, l3Cache: 192, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2026, price: 900 },
  { id: "9900x",    brand: "AMD", series: "Ryzen 9", model: "Ryzen 9 9900X", cores: 12, threads: 24, baseClock: 4.4, boostClock: 5.6, tdp: 120, maxTurboPower: 162, socket: "AM5", architecture: "Zen 5", processNode: 4, l2Cache: 12, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 380 },
  { id: "9800x3d",  brand: "AMD", series: "Ryzen 7", model: "Ryzen 7 9800X3D", cores: 8, threads: 16, baseClock: 4.7, boostClock: 5.2, tdp: 120, maxTurboPower: 162, socket: "AM5", architecture: "Zen 5 3D V-Cache", processNode: 4, l2Cache: 8, l3Cache: 96, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 480 },
  { id: "9850x3d",  brand: "AMD", series: "Ryzen 7", model: "Ryzen 7 9850X3D", cores: 8, threads: 16, baseClock: 4.7, boostClock: 5.6, tdp: 120, maxTurboPower: 162, socket: "AM5", architecture: "Zen 5 3D V-Cache", processNode: 4, l2Cache: 8, l3Cache: 96, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2026, price: 510 },
  { id: "9700x",    brand: "AMD", series: "Ryzen 7", model: "Ryzen 7 9700X", cores: 8, threads: 16, baseClock: 3.8, boostClock: 5.5, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 5", processNode: 4, l2Cache: 8, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 305 },
  { id: "9600x",    brand: "AMD", series: "Ryzen 5", model: "Ryzen 5 9600X", cores: 6, threads: 12, baseClock: 3.9, boostClock: 5.4, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 5", processNode: 4, l2Cache: 6, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 180 },

  // ══════════════════════════════════════════════════
  // Apple Silicon
  // ══════════════════════════════════════════════════
  { id: "m2pro",   brand: "Apple", series: "M2",  model: "M2 Pro",    cores: 12, threads: 12, baseClock: 3.5, boostClock: 3.5, tdp: 30, socket: "Apple SoC", architecture: "Apple M2 Pro", processNode: 5, l2Cache: 24, l3Cache: 24, integratedGpu: "19-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 4, pcieVersion: "4.0", launchYear: 2023, price: 300 },
  { id: "m2max",   brand: "Apple", series: "M2",  model: "M2 Max",    cores: 12, threads: 12, baseClock: 3.5, boostClock: 3.5, tdp: 35, socket: "Apple SoC", architecture: "Apple M2 Max", processNode: 5, l2Cache: 48, l3Cache: 48, integratedGpu: "30-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 4, pcieVersion: "4.0", launchYear: 2023, price: 400 },
  { id: "m2ultra", brand: "Apple", series: "M2",  model: "M2 Ultra",  cores: 24, threads: 24, baseClock: 3.5, boostClock: 3.5, tdp: 60, socket: "Apple SoC", architecture: "Apple M2 Ultra", processNode: 5, l2Cache: 96, l3Cache: 96, integratedGpu: "76-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 8, pcieVersion: "4.0", launchYear: 2023, price: 700 },
  { id: "m3",      brand: "Apple", series: "M3",  model: "M3",         cores: 8,  threads: 8,  baseClock: 4.05, boostClock: 4.05, tdp: 22, socket: "Apple SoC", architecture: "Apple M3", processNode: 3, l2Cache: 12, l3Cache: 12, integratedGpu: "10-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2023, price: 200 },
  { id: "m3pro",   brand: "Apple", series: "M3",  model: "M3 Pro",    cores: 12, threads: 12, baseClock: 4.05, boostClock: 4.05, tdp: 35, socket: "Apple SoC", architecture: "Apple M3 Pro", processNode: 3, l2Cache: 36, l3Cache: 36, integratedGpu: "18-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2023, price: 350 },
  { id: "m3max",   brand: "Apple", series: "M3",  model: "M3 Max",    cores: 16, threads: 16, baseClock: 4.05, boostClock: 4.05, tdp: 45, socket: "Apple SoC", architecture: "Apple M3 Max", processNode: 3, l2Cache: 48, l3Cache: 48, integratedGpu: "40-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 4, pcieVersion: "4.0", launchYear: 2023, price: 500 },
  { id: "m4",      brand: "Apple", series: "M4",  model: "M4",         cores: 10, threads: 10, baseClock: 4.4, boostClock: 4.4, tdp: 22, socket: "Apple SoC", architecture: "Apple M4", processNode: 3, l2Cache: 12, l3Cache: 12, integratedGpu: "10-core GPU", memorySupport: "LPDDR5-8533", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 200 },
  { id: "m4pro",   brand: "Apple", series: "M4",  model: "M4 Pro",    cores: 14, threads: 14, baseClock: 4.4, boostClock: 4.4, tdp: 35, socket: "Apple SoC", architecture: "Apple M4 Pro", processNode: 3, l2Cache: 36, l3Cache: 36, integratedGpu: "20-core GPU", memorySupport: "LPDDR5-8533", memoryChannels: 4, pcieVersion: "5.0", launchYear: 2024, price: 400 },
  { id: "m4max",   brand: "Apple", series: "M4",  model: "M4 Max",    cores: 16, threads: 16, baseClock: 4.4, boostClock: 4.4, tdp: 45, socket: "Apple SoC", architecture: "Apple M4 Max", processNode: 3, l2Cache: 48, l3Cache: 48, integratedGpu: "40-core GPU", memorySupport: "LPDDR5-8533", memoryChannels: 4, pcieVersion: "5.0", launchYear: 2024, price: 500 },
];

export const cpuSpecRows: SpecRow<CpuModel>[] = [
  { key: "brand", label: "cpuCompare.brand" },
  { key: "series", label: "cpuCompare.series" },
  { key: "launchYear", label: "cpuCompare.launchYear" },
  { key: "price", label: "cpuCompare.price", format: (v) => (v != null ? `$${v}` : "—") },
  { key: "architecture", label: "cpuCompare.architecture" },
  { key: "processNode", label: "cpuCompare.processNode", format: (v) => `${v} nm` },
  { key: "cores", label: "cpuCompare.cores" },
  { key: "threads", label: "cpuCompare.threads" },
  { key: "baseClock", label: "cpuCompare.baseClock", format: (v) => `${v} GHz` },
  { key: "boostClock", label: "cpuCompare.boostClock", format: (v) => `${v} GHz` },
  { key: "l2Cache", label: "cpuCompare.l2Cache", format: (v) => `${v} MB` },
  { key: "l3Cache", label: "cpuCompare.l3Cache", format: (v) => `${v} MB` },
  { key: "tdp", label: "cpuCompare.tdp", format: (v) => `${v} W` },
  { key: "maxTurboPower", label: "cpuCompare.maxTurboPower", format: (v) => (v != null ? `${v} W` : "—") },
  { key: "socket", label: "cpuCompare.socket" },
  { key: "memorySupport", label: "cpuCompare.memorySupport" },
  { key: "memoryChannels", label: "cpuCompare.memoryChannels" },
  { key: "pcieVersion", label: "cpuCompare.pcieVersion" },
  { key: "integratedGpu", label: "cpuCompare.integratedGpu" },
];

export const cpuFilterGroups: FilterGroup<CpuModel>[] = [
  { key: "brand", label: "cpuCompare.brand" },
  { key: "series", label: "cpuCompare.series" },
  { key: "socket", label: "cpuCompare.socket" },
  { key: "launchYear", label: "cpuCompare.launchYear" },
];

export const cpuModule: CompareDataModule<CpuModel> = {
  data: cpuData,
  specRows: cpuSpecRows,
  filterGroups: cpuFilterGroups,
  numericKeys: ["cores", "threads", "baseClock", "boostClock", "l3Cache", "l2Cache", "memoryChannels"],
  inverseKeys: ["tdp", "maxTurboPower", "processNode", "price"],
  i18nPrefix: "cpuCompare",
};