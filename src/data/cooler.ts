import type { CompareDataModule, SpecRow } from "@/components/HardwareCompare";

export interface CoolerModel {
  id: string;
  brand: string;
  model: string;
  type: string;
  radiatorSize: string;
  fanCount: number;
  fanSize: number;
  fanSpeed: string;
  noiseLevel: string;
  tdp: number;
  height: string;
  socketSupport: string;
  hasRgb: string;
  hasDisplay: string;
  launchYear: number;
}

export const coolerData: CoolerModel[] = [
  { id: "nhd15g2", brand: "Noctua", model: "NH-D15 G2", type: "Air", radiatorSize: "—", fanCount: 2, fanSize: 140, fanSpeed: "300-1500 RPM", noiseLevel: "24.8 dBA", tdp: 250, height: "168mm", socketSupport: "LGA1851/1700/1200, AM5/AM4", hasRgb: "No", hasDisplay: "No", launchYear: 2024 },
  { id: "darkpro5", brand: "be quiet!", model: "Dark Rock Pro 5", type: "Air", radiatorSize: "—", fanCount: 2, fanSize: 135, fanSpeed: "500-2000 RPM", noiseLevel: "23.7 dBA", tdp: 270, height: "168mm", socketSupport: "LGA1851/1700/1200, AM5/AM4", hasRgb: "No", hasDisplay: "No", launchYear: 2023 },
  { id: "assassiniv", brand: "DeepCool", model: "Assassin IV", type: "Air", radiatorSize: "—", fanCount: 2, fanSize: 140, fanSpeed: "500-1700 RPM", noiseLevel: "29.3 dBA", tdp: 280, height: "164mm", socketSupport: "LGA1700/1200, AM5/AM4", hasRgb: "No", hasDisplay: "No", launchYear: 2023 },
  { id: "peerless120", brand: "Thermalright", model: "Peerless Assassin 120 SE", type: "Air", radiatorSize: "—", fanCount: 2, fanSize: 120, fanSpeed: "600-1550 RPM", noiseLevel: "25.6 dBA", tdp: 265, height: "155mm", socketSupport: "LGA1700/1200, AM5/AM4", hasRgb: "No", hasDisplay: "No", launchYear: 2022 },
  { id: "kraken360", brand: "NZXT", model: "Kraken Elite 360", type: "AIO", radiatorSize: "360mm", fanCount: 3, fanSize: 120, fanSpeed: "500-2000 RPM", noiseLevel: "33.9 dBA", tdp: 350, height: "—", socketSupport: "LGA1851/1700/1200, AM5/AM4", hasRgb: "Yes (ARGB Fans)", hasDisplay: "Yes (2.7\" LCD)", launchYear: 2023 },
  { id: "h150i", brand: "Corsair", model: "iCUE H150i Elite LCD XT", type: "AIO", radiatorSize: "360mm", fanCount: 3, fanSize: 120, fanSpeed: "400-2400 RPM", noiseLevel: "36 dBA", tdp: 350, height: "—", socketSupport: "LGA1700/1200, AM5/AM4", hasRgb: "Yes (ARGB Fans)", hasDisplay: "Yes (LCD)", launchYear: 2022 },
  { id: "silentloop3", brand: "be quiet!", model: "Silent Loop 3 360", type: "AIO", radiatorSize: "360mm", fanCount: 3, fanSize: 120, fanSpeed: "400-2100 RPM", noiseLevel: "32.8 dBA", tdp: 350, height: "—", socketSupport: "LGA1851/1700/1200, AM5/AM4", hasRgb: "Yes (ARGB)", hasDisplay: "No", launchYear: 2025 },
  { id: "h170i", brand: "Corsair", model: "iCUE H170i Elite Capellix XT", type: "AIO", radiatorSize: "420mm", fanCount: 3, fanSize: 140, fanSpeed: "300-1700 RPM", noiseLevel: "34.1 dBA", tdp: 400, height: "—", socketSupport: "LGA1700/1200, AM5/AM4", hasRgb: "Yes (ARGB Fans)", hasDisplay: "No", launchYear: 2023 },
  { id: "ryujin3", brand: "ASUS", model: "ROG Ryujin III 360", type: "AIO", radiatorSize: "360mm", fanCount: 3, fanSize: 120, fanSpeed: "600-2200 RPM", noiseLevel: "36.5 dBA", tdp: 350, height: "—", socketSupport: "LGA1700/1200, AM5/AM4", hasRgb: "Yes (ARGB Fans)", hasDisplay: "Yes (3.5\" LCD)", launchYear: 2023 },
  { id: "lf3_360", brand: "Arctic", model: "Liquid Freezer III 360", type: "AIO", radiatorSize: "360mm", fanCount: 3, fanSize: 120, fanSpeed: "200-1800 RPM", noiseLevel: "22.5 dBA", tdp: 350, height: "—", socketSupport: "LGA1851/1700/1200, AM5/AM4", hasRgb: "No", hasDisplay: "No", launchYear: 2024 },
  { id: "phantomspirit", brand: "Thermalright", model: "Phantom Spirit 120 EVO", type: "Air", radiatorSize: "—", fanCount: 2, fanSize: 120, fanSpeed: "600-2150 RPM", noiseLevel: "27.2 dBA", tdp: 280, height: "157mm", socketSupport: "LGA1851/1700/1200, AM5/AM4", hasRgb: "No", hasDisplay: "No", launchYear: 2024 },
];

export const coolerSpecRows: SpecRow<CoolerModel>[] = [
  { key: "brand", label: "coolerCompare.brand" },
  { key: "launchYear", label: "coolerCompare.launchYear" },
  { key: "type", label: "coolerCompare.type" },
  { key: "radiatorSize", label: "coolerCompare.radiatorSize" },
  { key: "fanCount", label: "coolerCompare.fanCount" },
  { key: "fanSize", label: "coolerCompare.fanSize", format: (v) => `${v} mm` },
  { key: "fanSpeed", label: "coolerCompare.fanSpeed" },
  { key: "noiseLevel", label: "coolerCompare.noiseLevel" },
  { key: "tdp", label: "coolerCompare.tdp", format: (v) => `${v} W` },
  { key: "height", label: "coolerCompare.height" },
  { key: "socketSupport", label: "coolerCompare.socketSupport" },
  { key: "hasRgb", label: "coolerCompare.hasRgb" },
  { key: "hasDisplay", label: "coolerCompare.hasDisplay" },
];

export const coolerModule: CompareDataModule<CoolerModel> = {
  data: coolerData,
  specRows: coolerSpecRows,
  numericKeys: ["fanCount", "fanSize", "tdp"],
  inverseKeys: [],
  i18nPrefix: "coolerCompare",
};