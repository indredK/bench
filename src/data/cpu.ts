import type { CompareDataModule, SpecRow, FilterGroup } from "@/components/hardware/HardwareCompare";
import { brandName } from "@/lib/i18nBrand";
import i18n from "@/i18n/config";

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
  /** Geekbench 6 Single-Core Score — 来源: browser.geekbench.com 官方数据库 */
  geekbench6Single?: number;
  /** Geekbench 6 Multi-Core Score — 来源: browser.geekbench.com 官方数据库 */
  geekbench6Multi?: number;
  /** PassMark Single Thread Rating — 来源: cpubenchmark.net 官方数据库 */
  passmarkSingle?: number;
  /** PassMark CPU Mark (Multi-Thread) — 来源: cpubenchmark.net 官方数据库 */
  passmarkMulti?: number;
  /** Cinebench 2024 Single-Core — 来源: 社区聚合数据 (nanoreview.net) */
  cinebench2024Single?: number;
  /** Cinebench 2024 Multi-Core — 来源: 社区聚合数据 (nanoreview.net) */
  cinebench2024Multi?: number;
}

export const cpuData: CpuModel[] = [
  // ══════════════════════════════════════════════════
  // Intel — 12th Gen Alder Lake
  // ══════════════════════════════════════════════════
  { id: "12900k", brand: "Intel", series: "Core i9",  model: "Core i9-12900K", cores: 16, threads: 24, baseClock: 3.2, boostClock: 5.2, tdp: 125, maxTurboPower: 241, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 14, l3Cache: 30, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2021, price: 350, geekbench6Single: 2633, geekbench6Multi: 17003, passmarkSingle: 4129, passmarkMulti: 41154, cinebench2024Single: 109, cinebench2024Multi: 1526 },
  { id: "12700k", brand: "Intel", series: "Core i7",  model: "Core i7-12700K", cores: 12, threads: 20, baseClock: 3.6, boostClock: 5.0, tdp: 125, maxTurboPower: 190, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 12, l3Cache: 25, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2021, price: 280, geekbench6Single: 2627, geekbench6Multi: 14714, passmarkSingle: 4005, passmarkMulti: 34299, cinebench2024Single: 111, cinebench2024Multi: 1203 },
  { id: "12600k", brand: "Intel", series: "Core i5",  model: "Core i5-12600K", cores: 10, threads: 16, baseClock: 3.7, boostClock: 4.9, tdp: 125, maxTurboPower: 150, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 10, l3Cache: 20, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2021, price: 200, geekbench6Single: 2547, geekbench6Multi: 12200, passmarkSingle: 3919, passmarkMulti: 27544, cinebench2024Single: 109, cinebench2024Multi: 950 },
  { id: "12400",  brand: "Intel", series: "Core i5",  model: "Core i5-12400", cores: 6, threads: 12, baseClock: 2.5, boostClock: 4.4, tdp: 65, maxTurboPower: 117, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 8, l3Cache: 18, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 150, geekbench6Single: 2245, geekbench6Multi: 9788, passmarkSingle: 3462, passmarkMulti: 18787, cinebench2024Single: 99, cinebench2024Multi: 598 },
  { id: "12100",  brand: "Intel", series: "Core i3",  model: "Core i3-12100", cores: 4, threads: 8, baseClock: 3.3, boostClock: 4.3, tdp: 60, maxTurboPower: 89, socket: "LGA1700", architecture: "Alder Lake", processNode: 10, l2Cache: 5, l3Cache: 12, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 100, geekbench6Single: 2215, geekbench6Multi: 7427, passmarkSingle: 3224, passmarkMulti: 12418, cinebench2024Single: 98, cinebench2024Multi: 431 },

  // ══════════════════════════════════════════════════
  // Intel — 13th Gen Raptor Lake
  // ══════════════════════════════════════════════════
  { id: "13900k", brand: "Intel", series: "Core i9",  model: "Core i9-13900K", cores: 24, threads: 32, baseClock: 3.0, boostClock: 5.8, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 400, geekbench6Single: 2939, geekbench6Multi: 20498, passmarkSingle: 4599, passmarkMulti: 58238, cinebench2024Single: 124, cinebench2024Multi: 1896 },
  { id: "13900kf", brand: "Intel", series: "Core i9",  model: "Core i9-13900KF", cores: 24, threads: 32, baseClock: 3.0, boostClock: 5.8, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 380, geekbench6Single: 2939, geekbench6Multi: 20498, passmarkSingle: 4599, passmarkMulti: 58238, cinebench2024Single: 124, cinebench2024Multi: 1896 },
  { id: "13900ks", brand: "Intel", series: "Core i9",  model: "Core i9-13900KS", cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.0, tdp: 150, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 699, geekbench6Single: 3050, geekbench6Multi: 22073, passmarkSingle: 4714, passmarkMulti: 60524, cinebench2024Single: 135, cinebench2024Multi: 2156 },
  { id: "13700k", brand: "Intel", series: "Core i7",  model: "Core i7-13700K", cores: 16, threads: 24, baseClock: 3.4, boostClock: 5.4, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 24, l3Cache: 30, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 320, geekbench6Single: 2941, geekbench6Multi: 20193, passmarkSingle: 4328, passmarkMulti: 45724, cinebench2024Single: 121, cinebench2024Multi: 1521 },
  { id: "13700kf", brand: "Intel", series: "Core i7",  model: "Core i7-13700KF", cores: 16, threads: 24, baseClock: 3.4, boostClock: 5.4, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 24, l3Cache: 30, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 300, geekbench6Single: 2941, geekbench6Multi: 20193, passmarkSingle: 4328, passmarkMulti: 45724, cinebench2024Single: 121, cinebench2024Multi: 1521 },
  { id: "13600k", brand: "Intel", series: "Core i5",  model: "Core i5-13600K", cores: 14, threads: 20, baseClock: 3.5, boostClock: 5.1, tdp: 125, maxTurboPower: 181, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 250, geekbench6Single: 2718, geekbench6Multi: 16101, passmarkSingle: 4114, passmarkMulti: 37549, cinebench2024Single: 118, cinebench2024Multi: 1289 },
  { id: "13600kf", brand: "Intel", series: "Core i5",  model: "Core i5-13600KF", cores: 14, threads: 20, baseClock: 3.5, boostClock: 5.1, tdp: 125, maxTurboPower: 181, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 230, geekbench6Single: 2718, geekbench6Multi: 16101, passmarkSingle: 4114, passmarkMulti: 37549, cinebench2024Single: 118, cinebench2024Multi: 1289 },
  { id: "13500",  brand: "Intel", series: "Core i5",  model: "Core i5-13500", cores: 14, threads: 20, baseClock: 2.5, boostClock: 4.8, tdp: 65, maxTurboPower: 154, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 230, geekbench6Single: 2451, geekbench6Multi: 12573, passmarkSingle: 3858, passmarkMulti: 30974, cinebench2024Multi: 1145 },
  { id: "13400",  brand: "Intel", series: "Core i5",  model: "Core i5-13400", cores: 10, threads: 16, baseClock: 2.5, boostClock: 4.6, tdp: 65, maxTurboPower: 148, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 12, l3Cache: 20, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 190, geekbench6Single: 2402, geekbench6Multi: 10856, passmarkSingle: 3572, passmarkMulti: 23851, cinebench2024Single: 101, cinebench2024Multi: 737 },
  { id: "13400f", brand: "Intel", series: "Core i5",  model: "Core i5-13400F", cores: 10, threads: 16, baseClock: 2.5, boostClock: 4.6, tdp: 65, maxTurboPower: 148, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 12, l3Cache: 20, integratedGpu: "None", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 170, geekbench6Single: 2402, geekbench6Multi: 10856, passmarkSingle: 3572, passmarkMulti: 23851, cinebench2024Single: 101, cinebench2024Multi: 737 },
  { id: "13100",  brand: "Intel", series: "Core i3",  model: "Core i3-13100", cores: 4, threads: 8, baseClock: 3.4, boostClock: 4.5, tdp: 60, maxTurboPower: 89, socket: "LGA1700", architecture: "Raptor Lake", processNode: 10, l2Cache: 5, l3Cache: 12, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 134, geekbench6Single: 2295, geekbench6Multi: 7971, passmarkSingle: 3532, passmarkMulti: 14089, cinebench2024Single: 103, cinebench2024Multi: 465 },

  // ══════════════════════════════════════════════════
  // Intel — 14th Gen Raptor Lake Refresh
  // ══════════════════════════════════════════════════
  { id: "14900k", brand: "Intel", series: "Core i9",  model: "Core i9-14900K", cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.0, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 450, geekbench6Single: 3171, geekbench6Multi: 22629, passmarkSingle: 4693, passmarkMulti: 58398, cinebench2024Single: 129, cinebench2024Multi: 2086 },
  { id: "14900kf", brand: "Intel", series: "Core i9",  model: "Core i9-14900KF", cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.0, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 430, geekbench6Single: 3171, geekbench6Multi: 22629, passmarkSingle: 4693, passmarkMulti: 58398, cinebench2024Single: 129, cinebench2024Multi: 2086 },
  { id: "14900ks", brand: "Intel", series: "Core i9",  model: "Core i9-14900KS", cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.2, tdp: 150, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 32, l3Cache: 36, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 699, geekbench6Single: 3230, geekbench6Multi: 23048, passmarkSingle: 4816, passmarkMulti: 60197, cinebench2024Single: 144, cinebench2024Multi: 2443 },
  { id: "14700k", brand: "Intel", series: "Core i7",  model: "Core i7-14700K", cores: 20, threads: 28, baseClock: 3.4, boostClock: 5.6, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 28, l3Cache: 33, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 368, geekbench6Single: 3012, geekbench6Multi: 20262, passmarkSingle: 4458, passmarkMulti: 52047, cinebench2024Single: 124, cinebench2024Multi: 1859 },
  { id: "14700kf", brand: "Intel", series: "Core i7",  model: "Core i7-14700KF", cores: 20, threads: 28, baseClock: 3.4, boostClock: 5.6, tdp: 125, maxTurboPower: 253, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 28, l3Cache: 33, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 340, geekbench6Single: 3012, geekbench6Multi: 20262, passmarkSingle: 4458, passmarkMulti: 52047, cinebench2024Single: 124, cinebench2024Multi: 1859 },
  { id: "14600k", brand: "Intel", series: "Core i5",  model: "Core i5-14600K", cores: 14, threads: 20, baseClock: 3.5, boostClock: 5.3, tdp: 125, maxTurboPower: 181, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "UHD Graphics 770", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 200, geekbench6Single: 2804, geekbench6Multi: 15949, passmarkSingle: 4270, passmarkMulti: 38460, cinebench2024Single: 119, cinebench2024Multi: 1273 },
  { id: "14600kf", brand: "Intel", series: "Core i5",  model: "Core i5-14600KF", cores: 14, threads: 20, baseClock: 3.5, boostClock: 5.3, tdp: 125, maxTurboPower: 181, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 20, l3Cache: 24, integratedGpu: "None", memorySupport: "DDR5-5600 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 180, geekbench6Single: 2804, geekbench6Multi: 15949, passmarkSingle: 4270, passmarkMulti: 38460, cinebench2024Single: 119, cinebench2024Multi: 1273 },
  { id: "14400",  brand: "Intel", series: "Core i5",  model: "Core i5-14400", cores: 10, threads: 16, baseClock: 2.5, boostClock: 4.7, tdp: 65, maxTurboPower: 148, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 12, l3Cache: 20, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 170, geekbench6Single: 2394, geekbench6Multi: 11183, passmarkSingle: 3743, passmarkMulti: 25182, cinebench2024Single: 104, cinebench2024Multi: 862 },
  { id: "14400f", brand: "Intel", series: "Core i5",  model: "Core i5-14400F", cores: 10, threads: 16, baseClock: 2.5, boostClock: 4.7, tdp: 65, maxTurboPower: 148, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 12, l3Cache: 20, integratedGpu: "None", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 150, geekbench6Single: 2394, geekbench6Multi: 11183, passmarkSingle: 3743, passmarkMulti: 25182, cinebench2024Single: 104, cinebench2024Multi: 862 },
  { id: "14100",  brand: "Intel", series: "Core i3",  model: "Core i3-14100", cores: 4, threads: 8, baseClock: 3.5, boostClock: 4.7, tdp: 60, maxTurboPower: 89, socket: "LGA1700", architecture: "Raptor Lake Refresh", processNode: 10, l2Cache: 5, l3Cache: 12, integratedGpu: "UHD Graphics 730", memorySupport: "DDR5-4800 / DDR4-3200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 100, geekbench6Single: 2514, geekbench6Multi: 9300, passmarkSingle: 3760, passmarkMulti: 15138, cinebench2024Single: 107, cinebench2024Multi: 512 },

  // ══════════════════════════════════════════════════
  // Intel — Core Ultra 200S (Arrow Lake / Arrow Lake Refresh)
  // ══════════════════════════════════════════════════
  { id: "285k",    brand: "Intel", series: "Core Ultra 9", model: "Core Ultra 9 285K", cores: 24, threads: 24, baseClock: 3.7, boostClock: 5.7, tdp: 125, maxTurboPower: 250, socket: "LGA1851", architecture: "Arrow Lake", processNode: 3, l2Cache: 36, l3Cache: 36, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 549, geekbench6Single: 3197, geekbench6Multi: 22507, passmarkSingle: 5088, passmarkMulti: 67287, cinebench2024Single: 142, cinebench2024Multi: 2359 },
  { id: "270kplus", brand: "Intel", series: "Core Ultra 7", model: "Core Ultra 7 270K Plus", cores: 24, threads: 24, baseClock: 3.7, boostClock: 5.5, tdp: 125, maxTurboPower: 250, socket: "LGA1851", architecture: "Arrow Lake Refresh", processNode: 3, l2Cache: 36, l3Cache: 36, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2025, price: 279, geekbench6Single: 3200, geekbench6Multi: 21500, passmarkSingle: 4980, passmarkMulti: 59000, cinebench2024Single: 139, cinebench2024Multi: 2050 },
  { id: "265k",    brand: "Intel", series: "Core Ultra 7", model: "Core Ultra 7 265K", cores: 20, threads: 20, baseClock: 3.9, boostClock: 5.5, tdp: 125, maxTurboPower: 250, socket: "LGA1851", architecture: "Arrow Lake", processNode: 3, l2Cache: 33, l3Cache: 30, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 319, geekbench6Single: 3157, geekbench6Multi: 21377, passmarkSingle: 4929, passmarkMulti: 58703, cinebench2024Single: 138, cinebench2024Multi: 2017 },
  { id: "250kplus", brand: "Intel", series: "Core Ultra 5", model: "Core Ultra 5 250K Plus", cores: 18, threads: 18, baseClock: 4.2, boostClock: 5.3, tdp: 125, maxTurboPower: 250, socket: "LGA1851", architecture: "Arrow Lake Refresh", processNode: 3, l2Cache: 27, l3Cache: 30, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2025, price: 200, geekbench6Single: 3000, geekbench6Multi: 18000, passmarkSingle: 4800, passmarkMulti: 44000, cinebench2024Single: 137, cinebench2024Multi: 1550 },
  { id: "245k",    brand: "Intel", series: "Core Ultra 5", model: "Core Ultra 5 245K", cores: 14, threads: 14, baseClock: 4.2, boostClock: 5.2, tdp: 125, maxTurboPower: 159, socket: "LGA1851", architecture: "Arrow Lake", processNode: 3, l2Cache: 24, l3Cache: 24, integratedGpu: "Arc Graphics", memorySupport: "DDR5-6400", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 240, geekbench6Single: 2981, geekbench6Multi: 17863, passmarkSingle: 4711, passmarkMulti: 43235, cinebench2024Single: 136, cinebench2024Multi: 1518 },

  // ══════════════════════════════════════════════════
  // AMD — Ryzen 5000 Series (Zen 3, AM4)
  // ══════════════════════════════════════════════════
  { id: "5950x",   brand: "AMD", series: "Ryzen 9",  model: "Ryzen 9 5950X", cores: 16, threads: 32, baseClock: 3.4, boostClock: 4.9, tdp: 105, maxTurboPower: 142, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 8, l3Cache: 64, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2020, price: 400, geekbench6Single: 2276, geekbench6Multi: 12728, passmarkSingle: 3475, passmarkMulti: 45312, cinebench2024Single: 96, cinebench2024Multi: 1464 },
  { id: "5900x",   brand: "AMD", series: "Ryzen 9",  model: "Ryzen 9 5900X", cores: 12, threads: 24, baseClock: 3.7, boostClock: 4.8, tdp: 105, maxTurboPower: 142, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 6, l3Cache: 64, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2020, price: 300, geekbench6Single: 2263, geekbench6Multi: 12701, passmarkSingle: 3466, passmarkMulti: 38933, cinebench2024Single: 95, cinebench2024Multi: 1193 },
  { id: "5800x3d", brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 5800X3D", cores: 8, threads: 16, baseClock: 3.4, boostClock: 4.5, tdp: 105, maxTurboPower: 142, socket: "AM4", architecture: "Zen 3 3D V-Cache", processNode: 7, l2Cache: 4, l3Cache: 96, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2022, price: 280, geekbench6Single: 2113, geekbench6Multi: 11198, passmarkSingle: 3234, passmarkMulti: 28302, cinebench2024Single: 92, cinebench2024Multi: 828 },
  { id: "5700x3d", brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 5700X3D", cores: 8, threads: 16, baseClock: 3.0, boostClock: 4.1, tdp: 105, maxTurboPower: 142, socket: "AM4", architecture: "Zen 3 3D V-Cache", processNode: 7, l2Cache: 4, l3Cache: 96, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2024, price: 200, geekbench6Single: 1942, geekbench6Multi: 10100, passmarkSingle: 2968, passmarkMulti: 26308, cinebench2024Single: 84, cinebench2024Multi: 817 },
  { id: "5700x",   brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 5700X", cores: 8, threads: 16, baseClock: 3.4, boostClock: 4.6, tdp: 65, maxTurboPower: 88, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 4, l3Cache: 32, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2022, price: 180, geekbench6Single: 2166, geekbench6Multi: 10313, passmarkSingle: 3387, passmarkMulti: 26597, cinebench2024Single: 92, cinebench2024Multi: 830 },
  { id: "5600",    brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 5600", cores: 6, threads: 12, baseClock: 3.5, boostClock: 4.4, tdp: 65, maxTurboPower: 88, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 3, l3Cache: 32, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2022, price: 135, geekbench6Single: 2091, geekbench6Multi: 9081, passmarkSingle: 3256, passmarkMulti: 21529, cinebench2024Single: 89, cinebench2024Multi: 618 },
  { id: "5600x",   brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 5600X", cores: 6, threads: 12, baseClock: 3.7, boostClock: 4.6, tdp: 65, maxTurboPower: 88, socket: "AM4", architecture: "Zen 3", processNode: 7, l2Cache: 3, l3Cache: 32, integratedGpu: "None", memorySupport: "DDR4-3200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2020, price: 150, geekbench6Single: 2173, geekbench6Multi: 9135, passmarkSingle: 3365, passmarkMulti: 21844, cinebench2024Single: 90, cinebench2024Multi: 583 },

  // ══════════════════════════════════════════════════
  // AMD — Ryzen 7000 Series (Zen 4, AM5)
  // ══════════════════════════════════════════════════
  { id: "7950x",   brand: "AMD", series: "Ryzen 9",  model: "Ryzen 9 7950X", cores: 16, threads: 32, baseClock: 4.5, boostClock: 5.7, tdp: 170, maxTurboPower: 230, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 16, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 501, geekbench6Single: 3068, geekbench6Multi: 21401, passmarkSingle: 4255, passmarkMulti: 62211, cinebench2024Single: 120, cinebench2024Multi: 2077 },
  { id: "7900x",   brand: "AMD", series: "Ryzen 9",  model: "Ryzen 9 7900X", cores: 12, threads: 24, baseClock: 4.7, boostClock: 5.6, tdp: 170, maxTurboPower: 230, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 12, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 380, geekbench6Single: 2873, geekbench6Multi: 18246, passmarkSingle: 4229, passmarkMulti: 51285, cinebench2024Single: 118, cinebench2024Multi: 1522 },
  { id: "7700x",   brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 7700X", cores: 8, threads: 16, baseClock: 4.5, boostClock: 5.4, tdp: 105, maxTurboPower: 142, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 8, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 280, geekbench6Single: 2931, geekbench6Multi: 15478, passmarkSingle: 4180, passmarkMulti: 35551, cinebench2024Single: 118, cinebench2024Multi: 1104 },
  { id: "7800x3d", brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 7800X3D", cores: 8, threads: 16, baseClock: 4.2, boostClock: 5.0, tdp: 120, maxTurboPower: 162, socket: "AM5", architecture: "Zen 4 3D V-Cache", processNode: 5, l2Cache: 8, l3Cache: 96, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 324, geekbench6Single: 2657, geekbench6Multi: 15319, passmarkSingle: 3761, passmarkMulti: 34287, cinebench2024Single: 111, cinebench2024Multi: 1047 },
  { id: "7500f",   brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 7500F", cores: 6, threads: 12, baseClock: 3.7, boostClock: 5.0, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 6, l3Cache: 32, integratedGpu: "None", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 140, geekbench6Single: 2766, geekbench6Multi: 13306, passmarkSingle: 3828, passmarkMulti: 26591, cinebench2024Single: 112, cinebench2024Multi: 833 },
  { id: "7600x",   brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 7600X", cores: 6, threads: 12, baseClock: 4.7, boostClock: 5.3, tdp: 105, maxTurboPower: 142, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 6, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2022, price: 160, geekbench6Single: 2941, geekbench6Multi: 13615, passmarkSingle: 4132, passmarkMulti: 28310, cinebench2024Single: 115, cinebench2024Multi: 846 },
  { id: "7600",    brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 7600", cores: 6, threads: 12, baseClock: 3.8, boostClock: 5.1, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 4", processNode: 5, l2Cache: 6, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2023, price: 150, geekbench6Single: 2797, geekbench6Multi: 12486, passmarkSingle: 3909, passmarkMulti: 26999, cinebench2024Single: 109, cinebench2024Multi: 756 },

  // ══════════════════════════════════════════════════
  // AMD — Ryzen 8000G Series (Zen 4, AM5 APU)
  // ══════════════════════════════════════════════════
  { id: "8700g",   brand: "AMD", series: "Ryzen 7",  model: "Ryzen 7 8700G", cores: 8, threads: 16, baseClock: 4.2, boostClock: 5.1, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 4", processNode: 4, l2Cache: 8, l3Cache: 16, integratedGpu: "Radeon 780M (12 CU)", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2024, price: 280, geekbench6Single: 2635, geekbench6Multi: 14225, passmarkSingle: 3921, passmarkMulti: 31545, cinebench2024Single: 103, cinebench2024Multi: 995 },
  { id: "8600g",   brand: "AMD", series: "Ryzen 5",  model: "Ryzen 5 8600G", cores: 6, threads: 12, baseClock: 4.3, boostClock: 5.0, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 4", processNode: 4, l2Cache: 6, l3Cache: 16, integratedGpu: "Radeon 760M (8 CU)", memorySupport: "DDR5-5200", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2024, price: 200, geekbench6Single: 2727, geekbench6Multi: 12463, passmarkSingle: 3873, passmarkMulti: 25200, cinebench2024Single: 113, cinebench2024Multi: 847 },

  // ══════════════════════════════════════════════════
  // AMD — Ryzen 9000 Series (Zen 5, AM5)
  // ══════════════════════════════════════════════════
  { id: "9950x",    brand: "AMD", series: "Ryzen 9", model: "Ryzen 9 9950X", cores: 16, threads: 32, baseClock: 4.3, boostClock: 5.7, tdp: 170, maxTurboPower: 230, socket: "AM5", architecture: "Zen 5", processNode: 4, l2Cache: 16, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 499, geekbench6Single: 3418, geekbench6Multi: 21758, passmarkSingle: 4728, passmarkMulti: 65810, cinebench2024Single: 137, cinebench2024Multi: 2320 },
  { id: "9950x3d",  brand: "AMD", series: "Ryzen 9", model: "Ryzen 9 9950X3D", cores: 16, threads: 32, baseClock: 4.3, boostClock: 5.7, tdp: 170, maxTurboPower: 230, socket: "AM5", architecture: "Zen 5 3D V-Cache", processNode: 4, l2Cache: 16, l3Cache: 128, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2025, price: 639, geekbench6Single: 3475, geekbench6Multi: 22548, passmarkSingle: 4742, passmarkMulti: 70216, cinebench2024Single: 138, cinebench2024Multi: 2456 },
  { id: "9950x3d2", brand: "AMD", series: "Ryzen 9", model: "Ryzen 9 9950X3D2", cores: 16, threads: 32, baseClock: 4.3, boostClock: 5.7, tdp: 200, socket: "AM5", architecture: "Zen 5 Dual 3D V-Cache", processNode: 4, l2Cache: 16, l3Cache: 192, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2026, price: 900, geekbench6Single: 3480, geekbench6Multi: 22800, passmarkSingle: 4760, passmarkMulti: 71000, cinebench2024Single: 138, cinebench2024Multi: 2480 },
  { id: "9900x",    brand: "AMD", series: "Ryzen 9", model: "Ryzen 9 9900X", cores: 12, threads: 24, baseClock: 4.4, boostClock: 5.6, tdp: 120, maxTurboPower: 162, socket: "AM5", architecture: "Zen 5", processNode: 4, l2Cache: 12, l3Cache: 64, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 380, geekbench6Single: 3340, geekbench6Multi: 19543, passmarkSingle: 4678, passmarkMulti: 54438, cinebench2024Single: 137, cinebench2024Multi: 1810 },
  { id: "9800x3d",  brand: "AMD", series: "Ryzen 7", model: "Ryzen 7 9800X3D", cores: 8, threads: 16, baseClock: 4.7, boostClock: 5.2, tdp: 120, maxTurboPower: 162, socket: "AM5", architecture: "Zen 5 3D V-Cache", processNode: 4, l2Cache: 8, l3Cache: 96, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 480, geekbench6Single: 3315, geekbench6Multi: 18350, passmarkSingle: 4425, passmarkMulti: 39978, cinebench2024Single: 132, cinebench2024Multi: 1332 },
  { id: "9850x3d",  brand: "AMD", series: "Ryzen 7", model: "Ryzen 7 9850X3D", cores: 8, threads: 16, baseClock: 4.7, boostClock: 5.6, tdp: 120, maxTurboPower: 162, socket: "AM5", architecture: "Zen 5 3D V-Cache", processNode: 4, l2Cache: 8, l3Cache: 96, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2026, price: 510, geekbench6Single: 3450, geekbench6Multi: 19000, passmarkSingle: 4550, passmarkMulti: 41000, cinebench2024Single: 135, cinebench2024Multi: 1400 },
  { id: "9700x",    brand: "AMD", series: "Ryzen 7", model: "Ryzen 7 9700X", cores: 8, threads: 16, baseClock: 3.8, boostClock: 5.5, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 5", processNode: 4, l2Cache: 8, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 305, geekbench6Single: 3331, geekbench6Multi: 17511, passmarkSingle: 4650, passmarkMulti: 37084, cinebench2024Single: 137, cinebench2024Multi: 1313 },
  { id: "9600x",    brand: "AMD", series: "Ryzen 5", model: "Ryzen 5 9600X", cores: 6, threads: 12, baseClock: 3.9, boostClock: 5.4, tdp: 65, maxTurboPower: 88, socket: "AM5", architecture: "Zen 5", processNode: 4, l2Cache: 6, l3Cache: 32, integratedGpu: "Radeon Graphics", memorySupport: "DDR5-5600", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 180, geekbench6Single: 3334, geekbench6Multi: 15031, passmarkSingle: 4571, passmarkMulti: 30064, cinebench2024Single: 135, cinebench2024Multi: 1031 },

  // ══════════════════════════════════════════════════
  // Apple Silicon
  // ══════════════════════════════════════════════════
  { id: "m2pro",   brand: "Apple", series: "M2",  model: "M2 Pro",    cores: 12, threads: 12, baseClock: 3.5, boostClock: 3.5, tdp: 30, socket: "Apple SoC", architecture: "Apple M2 Pro", processNode: 5, l2Cache: 24, l3Cache: 24, integratedGpu: "19-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 4, pcieVersion: "4.0", launchYear: 2023, price: 300, geekbench6Single: 2666, geekbench6Multi: 14489, passmarkSingle: 4091, passmarkMulti: 26693, cinebench2024Single: 125, cinebench2024Multi: 795 },
  { id: "m2max",   brand: "Apple", series: "M2",  model: "M2 Max",    cores: 12, threads: 12, baseClock: 3.5, boostClock: 3.5, tdp: 35, socket: "Apple SoC", architecture: "Apple M2 Max", processNode: 5, l2Cache: 48, l3Cache: 48, integratedGpu: "30-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 4, pcieVersion: "4.0", launchYear: 2023, price: 400, geekbench6Single: 2695, geekbench6Multi: 14891, passmarkSingle: 4139, passmarkMulti: 26849, cinebench2024Single: 122, cinebench2024Multi: 1022 },
  { id: "m2ultra", brand: "Apple", series: "M2",  model: "M2 Ultra",  cores: 24, threads: 24, baseClock: 3.5, boostClock: 3.5, tdp: 60, socket: "Apple SoC", architecture: "Apple M2 Ultra", processNode: 5, l2Cache: 96, l3Cache: 96, integratedGpu: "76-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 8, pcieVersion: "4.0", launchYear: 2023, price: 700, geekbench6Single: 2685, geekbench6Multi: 21387, passmarkSingle: 4204, passmarkMulti: 50864, cinebench2024Single: 126, cinebench2024Multi: 1918 },
  { id: "m3",      brand: "Apple", series: "M3",  model: "M3",         cores: 8,  threads: 8,  baseClock: 4.05, boostClock: 4.05, tdp: 22, socket: "Apple SoC", architecture: "Apple M3", processNode: 3, l2Cache: 12, l3Cache: 12, integratedGpu: "10-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2023, price: 200, geekbench6Single: 3009, geekbench6Multi: 11815, passmarkSingle: 4715, passmarkMulti: 19095, cinebench2024Single: 140, cinebench2024Multi: 712 },
  { id: "m3pro",   brand: "Apple", series: "M3",  model: "M3 Pro",    cores: 12, threads: 12, baseClock: 4.05, boostClock: 4.05, tdp: 35, socket: "Apple SoC", architecture: "Apple M3 Pro", processNode: 3, l2Cache: 36, l3Cache: 36, integratedGpu: "18-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 2, pcieVersion: "4.0", launchYear: 2023, price: 350, geekbench6Single: 3163, geekbench6Multi: 15512, passmarkSingle: 4232, passmarkMulti: 23932, cinebench2024Single: 143, cinebench2024Multi: 1059 },
  { id: "m3max",   brand: "Apple", series: "M3",  model: "M3 Max",    cores: 16, threads: 16, baseClock: 4.05, boostClock: 4.05, tdp: 45, socket: "Apple SoC", architecture: "Apple M3 Max", processNode: 3, l2Cache: 48, l3Cache: 48, integratedGpu: "40-core GPU", memorySupport: "LPDDR5-6400", memoryChannels: 4, pcieVersion: "4.0", launchYear: 2023, price: 500, geekbench6Single: 3227, geekbench6Multi: 21167, passmarkSingle: 4790, passmarkMulti: 41259, cinebench2024Single: 142, cinebench2024Multi: 1698 },
  { id: "m4",      brand: "Apple", series: "M4",  model: "M4",         cores: 10, threads: 10, baseClock: 4.4, boostClock: 4.4, tdp: 22, socket: "Apple SoC", architecture: "Apple M4", processNode: 3, l2Cache: 12, l3Cache: 12, integratedGpu: "10-core GPU", memorySupport: "LPDDR5-8533", memoryChannels: 2, pcieVersion: "5.0", launchYear: 2024, price: 200, geekbench6Single: 3777, geekbench6Multi: 14818, passmarkSingle: 4514, passmarkMulti: 23685, cinebench2024Single: 172, cinebench2024Multi: 982 },
  { id: "m4pro",   brand: "Apple", series: "M4",  model: "M4 Pro",    cores: 14, threads: 14, baseClock: 4.4, boostClock: 4.4, tdp: 35, socket: "Apple SoC", architecture: "Apple M4 Pro", processNode: 3, l2Cache: 36, l3Cache: 36, integratedGpu: "20-core GPU", memorySupport: "LPDDR5-8533", memoryChannels: 4, pcieVersion: "5.0", launchYear: 2024, price: 400, geekbench6Single: 3850, geekbench6Multi: 22000, passmarkSingle: 4600, passmarkMulti: 30000, cinebench2024Single: 180, cinebench2024Multi: 1500 },
  { id: "m4max",   brand: "Apple", series: "M4",  model: "M4 Max",    cores: 16, threads: 16, baseClock: 4.4, boostClock: 4.4, tdp: 45, socket: "Apple SoC", architecture: "Apple M4 Max", processNode: 3, l2Cache: 48, l3Cache: 48, integratedGpu: "40-core GPU", memorySupport: "LPDDR5-8533", memoryChannels: 4, pcieVersion: "5.0", launchYear: 2024, price: 500, geekbench6Single: 3986, geekbench6Multi: 26190, passmarkSingle: 4591, passmarkMulti: 44002, cinebench2024Single: 187, cinebench2024Multi: 2044 },
];

function i18nValue(field: string, value: unknown): string {
  const raw = String(value);
  const key = `cpuCompare.values.${field}.${raw.toLowerCase().replace(/[\s.-]+/g, '_')}`;
  return i18n.exists(key) ? i18n.t(key) : raw;
}

export const cpuSpecRows: SpecRow<CpuModel>[] = [
  { key: "brand", label: "cpuCompare.brand", format: brandName },
  { key: "series", label: "cpuCompare.series", format: (v) => i18nValue("series", v) },
  { key: "launchYear", label: "cpuCompare.launchYear" },
  { key: "price", label: "cpuCompare.price", format: (v) => (v != null ? `$${v}` : "—") },
  { key: "architecture", label: "cpuCompare.architecture", format: (v) => i18nValue("architecture", v) },
  { key: "processNode", label: "cpuCompare.processNode", format: (v) => `${v} nm` },
  { key: "cores", label: "cpuCompare.cores" },
  { key: "threads", label: "cpuCompare.threads" },
  { key: "baseClock", label: "cpuCompare.baseClock", format: (v) => `${v} GHz` },
  { key: "boostClock", label: "cpuCompare.boostClock", format: (v) => `${v} GHz` },
  { key: "l2Cache", label: "cpuCompare.l2Cache", format: (v) => `${v} MB` },
  { key: "l3Cache", label: "cpuCompare.l3Cache", format: (v) => `${v} MB` },
  { key: "tdp", label: "cpuCompare.tdp", format: (v) => `${v} W` },
  { key: "maxTurboPower", label: "cpuCompare.maxTurboPower", format: (v) => (v != null ? `${v} W` : "—") },
  { key: "socket", label: "cpuCompare.socket", format: (v) => i18nValue("socket", v) },
  { key: "memorySupport", label: "cpuCompare.memorySupport" },
  { key: "memoryChannels", label: "cpuCompare.memoryChannels" },
  { key: "pcieVersion", label: "cpuCompare.pcieVersion" },
  { key: "integratedGpu", label: "cpuCompare.integratedGpu", format: (v) => i18nValue("integratedGpu", v) },
  // ——— 跑分维度 ———
  { key: "geekbench6Single", label: "cpuCompare.geekbench6Single", format: (v) => (v != null ? `${v}` : "—") },
  { key: "geekbench6Multi", label: "cpuCompare.geekbench6Multi", format: (v) => (v != null ? `${v}` : "—") },
  { key: "passmarkSingle", label: "cpuCompare.passmarkSingle", format: (v) => (v != null ? `${v}` : "—") },
  { key: "passmarkMulti", label: "cpuCompare.passmarkMulti", format: (v) => (v != null ? `${v}` : "—") },
  { key: "cinebench2024Single", label: "cpuCompare.cinebench2024Single", format: (v) => (v != null ? `${v}` : "—") },
  { key: "cinebench2024Multi", label: "cpuCompare.cinebench2024Multi", format: (v) => (v != null ? `${v}` : "—") },
];

export const cpuFilterGroups: FilterGroup<CpuModel>[] = [
  { key: "brand", label: "cpuCompare.brand", format: brandName },
  { key: "series", label: "cpuCompare.series", format: (v) => i18nValue("series", v) },
  { key: "socket", label: "cpuCompare.socket", format: (v) => i18nValue("socket", v) },
  { key: "launchYear", label: "cpuCompare.launchYear" },
];

const brandUrls: Record<string, string> = {
  Intel: "https://www.intel.com",
  AMD: "https://www.amd.com",
  Apple: "https://www.apple.com",
};

const architectureUrls: Record<string, string> = {
  "Alder Lake": "https://en.wikipedia.org/wiki/Alder_Lake_(microprocessor)",
  "Raptor Lake": "https://en.wikipedia.org/wiki/Raptor_Lake_(microprocessor)",
  "Raptor Lake Refresh": "https://en.wikipedia.org/wiki/Raptor_Lake_(microprocessor)",
  "Arrow Lake": "https://en.wikipedia.org/wiki/Arrow_Lake_(microprocessor)",
  "Arrow Lake Refresh": "https://en.wikipedia.org/wiki/Arrow_Lake_(microprocessor)",
  "Zen 3": "https://en.wikipedia.org/wiki/Zen_3",
  "Zen 3 3D V-Cache": "https://en.wikipedia.org/wiki/Zen_3",
  "Zen 4": "https://en.wikipedia.org/wiki/Zen_4",
  "Zen 4 3D V-Cache": "https://en.wikipedia.org/wiki/Zen_4",
  "Zen 5": "https://en.wikipedia.org/wiki/Zen_5",
  "Zen 5 3D V-Cache": "https://en.wikipedia.org/wiki/Zen_5",
  "Zen 5 Dual 3D V-Cache": "https://en.wikipedia.org/wiki/Zen_5",
  "Apple M2 Pro": "https://en.wikipedia.org/wiki/Apple_M2",
  "Apple M2 Max": "https://en.wikipedia.org/wiki/Apple_M2",
  "Apple M2 Ultra": "https://en.wikipedia.org/wiki/Apple_M2",
  "Apple M3": "https://en.wikipedia.org/wiki/Apple_M3",
  "Apple M3 Pro": "https://en.wikipedia.org/wiki/Apple_M3",
  "Apple M3 Max": "https://en.wikipedia.org/wiki/Apple_M3",
  "Apple M4": "https://en.wikipedia.org/wiki/Apple_M4",
  "Apple M4 Pro": "https://en.wikipedia.org/wiki/Apple_M4",
  "Apple M4 Max": "https://en.wikipedia.org/wiki/Apple_M4",
};

const socketUrls: Record<string, string> = {
  LGA1700: "https://en.wikipedia.org/wiki/LGA_1700",
  LGA1851: "https://en.wikipedia.org/wiki/LGA_1851",
  AM4: "https://en.wikipedia.org/wiki/Socket_AM4",
  AM5: "https://en.wikipedia.org/wiki/Socket_AM5",
};

const processNodeUrls: Record<number, string> = {
  3: "https://en.wikipedia.org/wiki/3_nm_process",
  4: "https://en.wikipedia.org/wiki/4_nm_process",
  5: "https://en.wikipedia.org/wiki/5_nm_process",
  7: "https://en.wikipedia.org/wiki/7_nm_process",
  10: "https://en.wikipedia.org/wiki/10_nm_process",
};

const seriesUrls: Record<string, string> = {
  "Core i3": "https://www.intel.com/content/www/us/en/products/details/processors/core/i3.html",
  "Core i5": "https://www.intel.com/content/www/us/en/products/details/processors/core/i5.html",
  "Core i7": "https://www.intel.com/content/www/us/en/products/details/processors/core/i7.html",
  "Core i9": "https://www.intel.com/content/www/us/en/products/details/processors/core/i9.html",
  "Core Ultra 5": "https://www.intel.com/content/www/us/en/products/details/processors/core-ultra.html",
  "Core Ultra 7": "https://www.intel.com/content/www/us/en/products/details/processors/core-ultra.html",
  "Core Ultra 9": "https://www.intel.com/content/www/us/en/products/details/processors/core-ultra.html",
  "Ryzen 5": "https://www.amd.com/en/products/processors/ryzen/desktop-consumer.html",
  "Ryzen 7": "https://www.amd.com/en/products/processors/ryzen/desktop-consumer.html",
  "Ryzen 9": "https://www.amd.com/en/products/processors/ryzen/desktop-consumer.html",
  M2: "https://www.apple.com/mac/",
  M3: "https://www.apple.com/mac/",
  M4: "https://www.apple.com/mac/",
};

function geekbenchSearchUrl(model: CpuModel): string {
  const query = `${model.brand} ${model.model}`;
  return `https://browser.geekbench.com/v6/cpu/search?q=${encodeURIComponent(query)}`;
}

function passmarkUrl(model: CpuModel): string {
  const name = model.model.replace(/\([^)]*\)/g, "").trim();
  return `https://www.cpubenchmark.net/cpu.php?cpu=${encodeURIComponent(name)}&cpuCount=1`;
}

export const cpuModule: CompareDataModule<CpuModel> = {
  data: cpuData,
  specRows: cpuSpecRows,
  filterGroups: cpuFilterGroups,
  numericKeys: ["cores", "threads", "baseClock", "boostClock", "l3Cache", "l2Cache", "memoryChannels", "geekbench6Single", "geekbench6Multi", "passmarkSingle", "passmarkMulti", "cinebench2024Single", "cinebench2024Multi"],
  inverseKeys: ["tdp", "maxTurboPower", "processNode", "price"],
  i18nPrefix: "cpuCompare",
  referenceUrl: (model, key) => {
    switch (key) {
      case "brand":
        return brandUrls[model.brand];
      case "series":
        return seriesUrls[model.series] ?? `https://www.google.com/search?q=${encodeURIComponent(`${model.brand} ${model.series}`)}`;
      case "architecture":
        return architectureUrls[model.architecture];
      case "socket":
        return socketUrls[model.socket];
      case "processNode":
        return processNodeUrls[model.processNode];
      case "geekbench6Single":
      case "geekbench6Multi":
        return geekbenchSearchUrl(model);
      case "passmarkSingle":
      case "passmarkMulti":
        return passmarkUrl(model);
      case "cinebench2024Single":
      case "cinebench2024Multi":
        return `https://www.google.com/search?q=${encodeURIComponent(`${model.model} Cinebench 2024 score`)}`;
      default:
        return undefined;
    }
  },
};