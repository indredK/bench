import type { CompareDataModule, SpecRow } from "@/components/HardwareCompare";

export interface GpuModel {
  id: string;
  brand: string;
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
  memoryBandwidth: number;
  rayTracing: string;
  upscalingTech: string;
  pcieVersion: string;
  launchYear: number;
}

export const gpuData: GpuModel[] = [
  { id: "rtx4090", brand: "NVIDIA", model: "GeForce RTX 4090", vram: 24, vramType: "GDDR6X", busWidth: 384, baseClock: 2.23, boostClock: 2.52, cudaCores: 16384, tdp: 450, architecture: "Ada Lovelace", processNode: 5, memoryBandwidth: 1008, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2022 },
  { id: "rtx5090", brand: "NVIDIA", model: "GeForce RTX 5090", vram: 32, vramType: "GDDR7", busWidth: 512, baseClock: 2.02, boostClock: 2.41, cudaCores: 21760, tdp: 575, architecture: "Blackwell", processNode: 4, memoryBandwidth: 1792, rayTracing: "4th Gen", upscalingTech: "DLSS 4", pcieVersion: "5.0", launchYear: 2025 },
  { id: "rtx4080s", brand: "NVIDIA", model: "GeForce RTX 4080 Super", vram: 16, vramType: "GDDR6X", busWidth: 256, baseClock: 2.21, boostClock: 2.55, cudaCores: 10240, tdp: 320, architecture: "Ada Lovelace", processNode: 5, memoryBandwidth: 736, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2024 },
  { id: "rtx5080", brand: "NVIDIA", model: "GeForce RTX 5080", vram: 16, vramType: "GDDR7", busWidth: 256, baseClock: 2.30, boostClock: 2.62, cudaCores: 10752, tdp: 360, architecture: "Blackwell", processNode: 4, memoryBandwidth: 960, rayTracing: "4th Gen", upscalingTech: "DLSS 4", pcieVersion: "5.0", launchYear: 2025 },
  { id: "rtx4070tis", brand: "NVIDIA", model: "GeForce RTX 4070 Ti Super", vram: 16, vramType: "GDDR6X", busWidth: 256, baseClock: 2.34, boostClock: 2.61, cudaCores: 8448, tdp: 285, architecture: "Ada Lovelace", processNode: 5, memoryBandwidth: 672, rayTracing: "3rd Gen", upscalingTech: "DLSS 3.5", pcieVersion: "4.0", launchYear: 2024 },
  { id: "rx7900xtx", brand: "AMD", model: "Radeon RX 7900 XTX", vram: 24, vramType: "GDDR6", busWidth: 384, baseClock: 1.9, boostClock: 2.5, cudaCores: 6144, tdp: 355, architecture: "RDNA 3", processNode: 5, memoryBandwidth: 960, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2022 },
  { id: "rx7900xt", brand: "AMD", model: "Radeon RX 7900 XT", vram: 20, vramType: "GDDR6", busWidth: 320, baseClock: 1.5, boostClock: 2.4, cudaCores: 5376, tdp: 315, architecture: "RDNA 3", processNode: 5, memoryBandwidth: 800, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2022 },
  { id: "rx7800xt", brand: "AMD", model: "Radeon RX 7800 XT", vram: 16, vramType: "GDDR6", busWidth: 256, baseClock: 1.8, boostClock: 2.43, cudaCores: 3840, tdp: 263, architecture: "RDNA 3", processNode: 5, memoryBandwidth: 624, rayTracing: "2nd Gen", upscalingTech: "FSR 3", pcieVersion: "4.0", launchYear: 2023 },
  { id: "a770", brand: "Intel", model: "Arc A770", vram: 16, vramType: "GDDR6", busWidth: 256, baseClock: 2.1, boostClock: 2.4, cudaCores: 4096, tdp: 225, architecture: "Alchemist", processNode: 6, memoryBandwidth: 560, rayTracing: "1st Gen", upscalingTech: "XeSS", pcieVersion: "4.0", launchYear: 2022 },
  { id: "b580", brand: "Intel", model: "Arc B580", vram: 12, vramType: "GDDR6", busWidth: 192, baseClock: 2.67, boostClock: 2.85, cudaCores: 2560, tdp: 190, architecture: "Battlemage", processNode: 5, memoryBandwidth: 456, rayTracing: "2nd Gen", upscalingTech: "XeSS 2", pcieVersion: "4.0", launchYear: 2024 },
];

export const gpuSpecRows: SpecRow<GpuModel>[] = [
  { key: "brand", label: "gpuCompare.brand" },
  { key: "launchYear", label: "gpuCompare.launchYear" },
  { key: "architecture", label: "gpuCompare.architecture" },
  { key: "processNode", label: "gpuCompare.processNode", format: (v) => `${v} nm` },
  { key: "cudaCores", label: "gpuCompare.cudaCores" },
  { key: "baseClock", label: "gpuCompare.baseClock", format: (v) => `${v} GHz` },
  { key: "boostClock", label: "gpuCompare.boostClock", format: (v) => `${v} GHz` },
  { key: "vram", label: "gpuCompare.vram", format: (v) => `${v} GB` },
  { key: "vramType", label: "gpuCompare.vramType" },
  { key: "busWidth", label: "gpuCompare.busWidth", format: (v) => `${v}-bit` },
  { key: "memoryBandwidth", label: "gpuCompare.memoryBandwidth", format: (v) => `${v} GB/s` },
  { key: "tdp", label: "gpuCompare.tdp", format: (v) => `${v} W` },
  { key: "rayTracing", label: "gpuCompare.rayTracing" },
  { key: "upscalingTech", label: "gpuCompare.upscalingTech" },
  { key: "pcieVersion", label: "gpuCompare.pcieVersion" },
];

export const gpuModule: CompareDataModule<GpuModel> = {
  data: gpuData,
  specRows: gpuSpecRows,
  numericKeys: ["cudaCores", "baseClock", "boostClock", "vram", "busWidth", "memoryBandwidth"],
  inverseKeys: ["tdp", "processNode"],
  i18nPrefix: "gpuCompare",
};