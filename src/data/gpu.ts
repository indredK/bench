import type { CompareDataModule, SpecRow, FilterGroup } from "@/components/hardware/HardwareCompare";
import { brandName } from "@/lib/i18nBrand";
import { t } from "i18next";

export interface GpuModel {
  id: string;
  brand: string;
  series: string;
  model: string;
  vram: number;
  vramType: string;
  busWidth: number;
  baseClock: number;
  boostClock: number;
  cudaCores: number;
  tdp: number;
  architecture: string;
  processNode: number;
  l2Cache: number;
  memoryBandwidth: number;
  rayTracing: string;
  upscalingTech: string;
  pcieVersion: string;
  launchYear: number;
  price?: number;
}

export const gpuData: GpuModel[] = [
  // ══════════════════════════════════════════════════
  // NVIDIA — GeForce RTX 40 Series (Ada Lovelace)
  // ══════════════════════════════════════════════════
  { id: "rtx4090",   brand: "NVIDIA", series: "GeForce RTX 40", model: "GeForce RTX 4090",     vram: 24, vramType: "GDDR6X", busWidth: 384, baseClock: 2.23, boostClock: 2.52, cudaCores: 16384, tdp: 450, architecture: "Ada Lovelace", processNode: 5, l2Cache: 72, memoryBandwidth: 1008, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2022, price: 1599 },
  { id: "rtx4080s",  brand: "NVIDIA", series: "GeForce RTX 40", model: "GeForce RTX 4080 Super", vram: 16, vramType: "GDDR6X", busWidth: 256, baseClock: 2.21, boostClock: 2.55, cudaCores: 10240, tdp: 320, architecture: "Ada Lovelace", processNode: 5, l2Cache: 64, memoryBandwidth: 736, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2024, price: 999 },
  { id: "rtx4080",   brand: "NVIDIA", series: "GeForce RTX 40", model: "GeForce RTX 4080",       vram: 16, vramType: "GDDR6X", busWidth: 256, baseClock: 2.21, boostClock: 2.51, cudaCores: 9728, tdp: 320, architecture: "Ada Lovelace", processNode: 5, l2Cache: 64, memoryBandwidth: 736, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2022, price: 1199 },
  { id: "rtx4070tis", brand: "NVIDIA", series: "GeForce RTX 40", model: "GeForce RTX 4070 Ti Super", vram: 16, vramType: "GDDR6X", busWidth: 256, baseClock: 2.34, boostClock: 2.61, cudaCores: 8448, tdp: 285, architecture: "Ada Lovelace", processNode: 5, l2Cache: 48, memoryBandwidth: 672, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2024, price: 799 },
  { id: "rtx4070s",  brand: "NVIDIA", series: "GeForce RTX 40", model: "GeForce RTX 4070 Super", vram: 12, vramType: "GDDR6X", busWidth: 192, baseClock: 1.98, boostClock: 2.48, cudaCores: 7168, tdp: 220, architecture: "Ada Lovelace", processNode: 5, l2Cache: 48, memoryBandwidth: 504, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2024, price: 599 },
  { id: "rtx4070",   brand: "NVIDIA", series: "GeForce RTX 40", model: "GeForce RTX 4070",       vram: 12, vramType: "GDDR6X", busWidth: 192, baseClock: 1.92, boostClock: 2.48, cudaCores: 5888, tdp: 200, architecture: "Ada Lovelace", processNode: 5, l2Cache: 36, memoryBandwidth: 504, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2023, price: 549 },
  { id: "rtx4060ti", brand: "NVIDIA", series: "GeForce RTX 40", model: "GeForce RTX 4060 Ti",   vram: 8, vramType: "GDDR6X", busWidth: 128, baseClock: 2.31, boostClock: 2.54, cudaCores: 4352, tdp: 160, architecture: "Ada Lovelace", processNode: 5, l2Cache: 32, memoryBandwidth: 288, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2023, price: 399 },
  { id: "rtx4060",   brand: "NVIDIA", series: "GeForce RTX 40", model: "GeForce RTX 4060",       vram: 8, vramType: "GDDR6", busWidth: 128, baseClock: 1.83, boostClock: 2.46, cudaCores: 3072, tdp: 115, architecture: "Ada Lovelace", processNode: 5, l2Cache: 24, memoryBandwidth: 272, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2023, price: 299 },

  // ══════════════════════════════════════════════════
  // NVIDIA — GeForce RTX 50 Series (Blackwell)
  // ══════════════════════════════════════════════════
  { id: "rtx5090",   brand: "NVIDIA", series: "GeForce RTX 50", model: "GeForce RTX 5090",     vram: 32, vramType: "GDDR7", busWidth: 512, baseClock: 2.02, boostClock: 2.41, cudaCores: 21760, tdp: 575, architecture: "Blackwell", processNode: 4, l2Cache: 128, memoryBandwidth: 1792, rayTracing: "4th Gen", upscalingTech: "DLSS 4", pcieVersion: "5.0", launchYear: 2025, price: 1999 },
  { id: "rtx5080",   brand: "NVIDIA", series: "GeForce RTX 50", model: "GeForce RTX 5080",     vram: 16, vramType: "GDDR7", busWidth: 256, baseClock: 2.30, boostClock: 2.62, cudaCores: 10752, tdp: 360, architecture: "Blackwell", processNode: 4, l2Cache: 64, memoryBandwidth: 960, rayTracing: "4th Gen", upscalingTech: "DLSS 4", pcieVersion: "5.0", launchYear: 2025, price: 999 },
  { id: "rtx5070ti", brand: "NVIDIA", series: "GeForce RTX 50", model: "GeForce RTX 5070 Ti",  vram: 16, vramType: "GDDR7", busWidth: 256, baseClock: 2.16, boostClock: 2.58, cudaCores: 8960, tdp: 300, architecture: "Blackwell", processNode: 4, l2Cache: 48, memoryBandwidth: 896, rayTracing: "4th Gen", upscalingTech: "DLSS 4", pcieVersion: "5.0", launchYear: 2025, price: 749 },
  { id: "rtx5070",   brand: "NVIDIA", series: "GeForce RTX 50", model: "GeForce RTX 5070",     vram: 12, vramType: "GDDR7", busWidth: 192, baseClock: 2.16, boostClock: 2.54, cudaCores: 6144, tdp: 250, architecture: "Blackwell", processNode: 4, l2Cache: 48, memoryBandwidth: 672, rayTracing: "4th Gen", upscalingTech: "DLSS 4", pcieVersion: "5.0", launchYear: 2025, price: 549 },
  { id: "rtx5060",   brand: "NVIDIA", series: "GeForce RTX 50", model: "GeForce RTX 5060",     vram: 8, vramType: "GDDR7", busWidth: 128, baseClock: 2.23, boostClock: 2.50, cudaCores: 3840, tdp: 150, architecture: "Blackwell", processNode: 4, l2Cache: 32, memoryBandwidth: 448, rayTracing: "4th Gen", upscalingTech: "DLSS 4", pcieVersion: "5.0", launchYear: 2025, price: 449 },

  // ══════════════════════════════════════════════════
  // AMD — Radeon RX 7000 Series (RDNA 3)
  // ══════════════════════════════════════════════════
  { id: "rx7900xtx", brand: "AMD", series: "Radeon RX 7000", model: "Radeon RX 7900 XTX", vram: 24, vramType: "GDDR6", busWidth: 384, baseClock: 1.9, boostClock: 2.5, cudaCores: 6144, tdp: 355, architecture: "RDNA 3", processNode: 5, l2Cache: 96, memoryBandwidth: 960, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2022, price: 999 },
  { id: "rx7900xt",  brand: "AMD", series: "Radeon RX 7000", model: "Radeon RX 7900 XT",  vram: 20, vramType: "GDDR6", busWidth: 320, baseClock: 1.5, boostClock: 2.4, cudaCores: 5376, tdp: 315, architecture: "RDNA 3", processNode: 5, l2Cache: 80, memoryBandwidth: 800, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2022, price: 799 },
  { id: "rx7900gre", brand: "AMD", series: "Radeon RX 7000", model: "Radeon RX 7900 GRE", vram: 16, vramType: "GDDR6", busWidth: 256, baseClock: 1.88, boostClock: 2.25, cudaCores: 5120, tdp: 260, architecture: "RDNA 3", processNode: 5, l2Cache: 64, memoryBandwidth: 576, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2024, price: 549 },
  { id: "rx7800xt",  brand: "AMD", series: "Radeon RX 7000", model: "Radeon RX 7800 XT",  vram: 16, vramType: "GDDR6", busWidth: 256, baseClock: 1.8, boostClock: 2.43, cudaCores: 3840, tdp: 263, architecture: "RDNA 3", processNode: 5, l2Cache: 64, memoryBandwidth: 624, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2023, price: 499 },
  { id: "rx7700xt",  brand: "AMD", series: "Radeon RX 7000", model: "Radeon RX 7700 XT",  vram: 12, vramType: "GDDR6", busWidth: 192, baseClock: 1.7, boostClock: 2.54, cudaCores: 3456, tdp: 245, architecture: "RDNA 3", processNode: 5, l2Cache: 48, memoryBandwidth: 432, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2023, price: 449 },
  { id: "rx7600xt",  brand: "AMD", series: "Radeon RX 7000", model: "Radeon RX 7600 XT",  vram: 16, vramType: "GDDR6", busWidth: 128, baseClock: 1.5, boostClock: 2.75, cudaCores: 2048, tdp: 190, architecture: "RDNA 3", processNode: 5, l2Cache: 32, memoryBandwidth: 288, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2024, price: 329 },
  { id: "rx7600",    brand: "AMD", series: "Radeon RX 7000", model: "Radeon RX 7600",      vram: 8, vramType: "GDDR6", busWidth: 128, baseClock: 1.72, boostClock: 2.66, cudaCores: 2048, tdp: 165, architecture: "RDNA 3", processNode: 6, l2Cache: 32, memoryBandwidth: 288, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2023, price: 269 },

  // ══════════════════════════════════════════════════
  // AMD — Radeon RX 9000 Series (RDNA 4)
  // ══════════════════════════════════════════════════
  { id: "rx9070xt",  brand: "AMD", series: "Radeon RX 9000", model: "Radeon RX 9070 XT",  vram: 16, vramType: "GDDR6", busWidth: 256, baseClock: 2.1, boostClock: 3.0, cudaCores: 4096, tdp: 304, architecture: "RDNA 4", processNode: 4, l2Cache: 64, memoryBandwidth: 624, rayTracing: "3rd Gen", upscalingTech: "FSR 4", pcieVersion: "5.0", launchYear: 2025, price: 599 },
  { id: "rx9070",    brand: "AMD", series: "Radeon RX 9000", model: "Radeon RX 9070",      vram: 16, vramType: "GDDR6", busWidth: 256, baseClock: 2.0, boostClock: 2.8, cudaCores: 3584, tdp: 260, architecture: "RDNA 4", processNode: 4, l2Cache: 64, memoryBandwidth: 624, rayTracing: "3rd Gen", upscalingTech: "FSR 4", pcieVersion: "5.0", launchYear: 2025, price: 549 },

  // ══════════════════════════════════════════════════
  // Intel — Arc (Alchemist / Battlemage)
  // ══════════════════════════════════════════════════
  { id: "b580", brand: "Intel", series: "Arc", model: "Arc B580", vram: 12, vramType: "GDDR6", busWidth: 192, baseClock: 2.67, boostClock: 2.85, cudaCores: 2560, tdp: 190, architecture: "Battlemage", processNode: 5, l2Cache: 18, memoryBandwidth: 456, rayTracing: "2nd Gen", upscalingTech: "XeSS 2", pcieVersion: "4.0", launchYear: 2024, price: 249 },
  { id: "b570", brand: "Intel", series: "Arc", model: "Arc B570", vram: 10, vramType: "GDDR6", busWidth: 160, baseClock: 2.5, boostClock: 2.75, cudaCores: 2304, tdp: 150, architecture: "Battlemage", processNode: 5, l2Cache: 16, memoryBandwidth: 380, rayTracing: "2nd Gen", upscalingTech: "XeSS 2", pcieVersion: "4.0", launchYear: 2025, price: 219 },
  { id: "a770",  brand: "Intel", series: "Arc", model: "Arc A770",  vram: 16, vramType: "GDDR6", busWidth: 256, baseClock: 2.1, boostClock: 2.4, cudaCores: 4096, tdp: 225, architecture: "Alchemist", processNode: 6, l2Cache: 16, memoryBandwidth: 560, rayTracing: "1st Gen", upscalingTech: "XeSS", pcieVersion: "4.0", launchYear: 2022, price: 349 },
  { id: "a750",  brand: "Intel", series: "Arc", model: "Arc A750",  vram: 8, vramType: "GDDR6", busWidth: 256, baseClock: 2.05, boostClock: 2.4, cudaCores: 3584, tdp: 225, architecture: "Alchemist", processNode: 6, l2Cache: 16, memoryBandwidth: 512, rayTracing: "1st Gen", upscalingTech: "XeSS", pcieVersion: "4.0", launchYear: 2022, price: 249 },
];

export const gpuSpecRows: SpecRow<GpuModel>[] = [
  { key: "brand", label: "gpuCompare.brand", format: brandName },
  { key: "series", label: "gpuCompare.series" },
  { key: "launchYear", label: "gpuCompare.launchYear" },
  { key: "price", label: "gpuCompare.price", format: (v) => (v != null ? `$${v}` : "—") },
  { key: "architecture", label: "gpuCompare.architecture" },
  { key: "processNode", label: "gpuCompare.processNode", format: (v) => `${v} nm` },
  { key: "cudaCores", label: "gpuCompare.cudaCores" },
  { key: "baseClock", label: "gpuCompare.baseClock", format: (v) => `${v} GHz` },
  { key: "boostClock", label: "gpuCompare.boostClock", format: (v) => `${v} GHz` },
  { key: "vram", label: "gpuCompare.vram", format: (v) => `${v} GB` },
  { key: "vramType", label: "gpuCompare.vramType" },
  { key: "busWidth", label: "gpuCompare.busWidth", format: (v) => `${v}-bit` },
  { key: "l2Cache", label: "gpuCompare.l2Cache", format: (v) => `${v} MB` },
  { key: "memoryBandwidth", label: "gpuCompare.memoryBandwidth", format: (v) => `${v} GB/s` },
  { key: "tdp", label: "gpuCompare.tdp", format: (v) => `${v} W` },
  { key: "rayTracing", label: "gpuCompare.rayTracing" },
  { key: "upscalingTech", label: "gpuCompare.upscalingTech" },
  { key: "pcieVersion", label: "gpuCompare.pcieVersion" },
];

export const gpuFilterGroups: FilterGroup<GpuModel>[] = [
  { key: "brand", label: "gpuCompare.brand", format: brandName },
  { key: "series", label: "gpuCompare.series", format: (v) => { const str = String(v); const key = `gpuCompare.values.series.${str}`; const result = t(key); return result !== key ? result : str; } },
  { key: "vram", label: "gpuCompare.vram", format: (v) => `${v} GB` },
  { key: "launchYear", label: "gpuCompare.launchYear", format: (val) => String(val) },
];

export const gpuModule: CompareDataModule<GpuModel> = {
  data: gpuData,
  specRows: gpuSpecRows,
  filterGroups: gpuFilterGroups,
  numericKeys: ["cudaCores", "baseClock", "boostClock", "vram", "busWidth", "l2Cache", "memoryBandwidth"],
  inverseKeys: ["tdp", "processNode", "price"],
  i18nPrefix: "gpuCompare",
};
