/**
 * Static Data / 静态数据: export catalogs only; 只导出静态目录数据.
 */
import type { CompareDataModule, SpecRow, FilterGroup } from "@/shared/compare/types";
import { brandName } from "@/lib/i18nBrand";
import { t } from "i18next";

export interface MonitorModel {
  id: string;
  brand: string;
  series: string;
  model: string;
  size: number;
  resolution: string;
  panelType: string;
  refreshRate: number;
  responseTime: number;
  hdr: string;
  brightness: number;
  contrastRatio: string;
  colorGamut: string;
  adaptiveSync: string;
  ports: string;
  curved: string;
  vesa: string;
  launchYear: number;
}

const rawMonitorData: MonitorModel[] = [
  { id: "pg32ucdm", brand: "ASUS", series: "ROG Swift", model: "ROG Swift PG32UCDM", size: 31.5, resolution: "3840×2160", panelType: "QD-OLED", refreshRate: 240, responseTime: 0.03, hdr: "True Black 400", brightness: 1000, contrastRatio: "∞:1", colorGamut: "99% DCI-P3", adaptiveSync: "G-Sync Compatible, FreeSync Premium Pro", ports: "1x DP 1.4, 2x HDMI 2.1, 1x USB-C 90W", curved: "No", vesa: "100×100", launchYear: 2024 },
  { id: "pg27ucdm", brand: "ASUS", series: "ROG Swift", model: "ROG Swift PG27UCDM", size: 27, resolution: "3840×2160", panelType: "QD-OLED", refreshRate: 240, responseTime: 0.03, hdr: "True Black 400", brightness: 1000, contrastRatio: "∞:1", colorGamut: "99% DCI-P3", adaptiveSync: "G-Sync Compatible, FreeSync Premium Pro", ports: "1x DP 2.1, 2x HDMI 2.1, 1x USB-C 90W", curved: "No", vesa: "100×100", launchYear: 2025 },
  { id: "pg27aqn", brand: "ASUS", series: "ROG Swift", model: "ROG Swift PG27AQN", size: 27, resolution: "2560×1440", panelType: "Ultra-Fast IPS", refreshRate: 360, responseTime: 1, hdr: "HDR600", brightness: 600, contrastRatio: "1000:1", colorGamut: "95% DCI-P3", adaptiveSync: "G-Sync Ultimate", ports: "1x DP 1.4, 3x HDMI 2.0", curved: "No", vesa: "100×100", launchYear: 2022 },
  { id: "pg42uq", brand: "ASUS", series: "ROG Swift", model: "ROG Swift PG42UQ", size: 41.5, resolution: "3840×2160", panelType: "WOLED", refreshRate: 138, responseTime: 0.1, hdr: "HDR10", brightness: 900, contrastRatio: "∞:1", colorGamut: "98% DCI-P3", adaptiveSync: "G-Sync Compatible", ports: "2x HDMI 2.1, 2x HDMI 2.0, 1x DP 1.4", curved: "No", vesa: "300×300", launchYear: 2022 },
  { id: "aw3423dwf", brand: "Alienware", series: "AW", model: "AW3423DWF", size: 34, resolution: "3440×1440", panelType: "QD-OLED", refreshRate: 165, responseTime: 0.1, hdr: "True Black 400", brightness: 1000, contrastRatio: "∞:1", colorGamut: "99.3% DCI-P3", adaptiveSync: "FreeSync Premium Pro", ports: "2x DP 1.4, 1x HDMI 2.0", curved: "1800R", vesa: "100×100", launchYear: 2023 },
  { id: "aw2725df", brand: "Alienware", series: "AW", model: "AW2725DF", size: 27, resolution: "2560×1440", panelType: "QD-OLED", refreshRate: 360, responseTime: 0.03, hdr: "True Black 400", brightness: 1000, contrastRatio: "∞:1", colorGamut: "99% DCI-P3", adaptiveSync: "G-Sync Compatible, FreeSync Premium Pro", ports: "1x DP 1.4, 2x HDMI 2.1", curved: "No", vesa: "100×100", launchYear: 2024 },
  { id: "odysseyg9", brand: "Samsung", series: "Odyssey OLED", model: "Odyssey OLED G9", size: 49, resolution: "5120×1440", panelType: "QD-OLED", refreshRate: 240, responseTime: 0.03, hdr: "True Black 400", brightness: 1000, contrastRatio: "∞:1", colorGamut: "99% DCI-P3", adaptiveSync: "FreeSync Premium Pro, G-Sync Compatible", ports: "1x DP 1.4, 1x HDMI 2.1, 1x USB-C 65W", curved: "1800R", vesa: "100×100", launchYear: 2024 },
  { id: "lg27gr95qe", brand: "LG", series: "UltraGear", model: "UltraGear 27GR95QE", size: 27, resolution: "2560×1440", panelType: "WOLED", refreshRate: 240, responseTime: 0.03, hdr: "HDR10", brightness: 800, contrastRatio: "∞:1", colorGamut: "98.5% DCI-P3", adaptiveSync: "G-Sync Compatible, FreeSync Premium", ports: "1x DP 1.4, 2x HDMI 2.1", curved: "No", vesa: "100×100", launchYear: 2023 },
  { id: "gp27u", brand: "Cooler Master", series: "Tempest", model: "Tempest GP27U", size: 27, resolution: "3840×2160", panelType: "Mini-LED IPS", refreshRate: 160, responseTime: 1, hdr: "HDR1000", brightness: 1200, contrastRatio: "50000:1", colorGamut: "98% DCI-P3", adaptiveSync: "FreeSync Premium Pro", ports: "1x DP 1.4, 2x HDMI 2.1, 1x USB-C 90W", curved: "No", vesa: "100×100", launchYear: 2023 },
  { id: "m32u", brand: "Gigabyte", series: "M", model: "M32U", size: 31.5, resolution: "3840×2160", panelType: "IPS", refreshRate: 144, responseTime: 1, hdr: "HDR400", brightness: 400, contrastRatio: "1000:1", colorGamut: "90% DCI-P3", adaptiveSync: "FreeSync Premium Pro", ports: "1x DP 1.4, 2x HDMI 2.1, 1x USB-C 18W", curved: "No", vesa: "100×100", launchYear: 2021 },
  { id: "xeneonflex", brand: "Corsair", series: "Xeneon", model: "Xeneon Flex 45WQHD240", size: 45, resolution: "3440×1440", panelType: "WOLED", refreshRate: 240, responseTime: 0.03, hdr: "HDR10", brightness: 1000, contrastRatio: "∞:1", colorGamut: "98.5% DCI-P3", adaptiveSync: "G-Sync Compatible, FreeSync Premium", ports: "1x DP 1.4, 2x HDMI 2.1, 1x USB-C 30W", curved: "Bendable 800R", vesa: "100×100", launchYear: 2023 },
  { id: "dellu3224kb", brand: "Dell", series: "UltraSharp", model: "UltraSharp U3224KB", size: 31.5, resolution: "6144×3456", panelType: "IPS Black", refreshRate: 60, responseTime: 5, hdr: "HDR600", brightness: 450, contrastRatio: "2000:1", colorGamut: "99% DCI-P3", adaptiveSync: "No", ports: "1x DP 2.1, 1x HDMI 2.1, 1x Thunderbolt 4 140W", curved: "No", vesa: "100×100", launchYear: 2023 },
];

const monitorCurvedMap: Record<string, string> = {
  No: "flat",
  "1800R": "1800r",
  "Bendable 800R": "bendable800r",
};

function normalizeMonitor(model: MonitorModel): MonitorModel {
  return {
    ...model,
    brand: model.brand.toLowerCase().replace(/\s+/g, "_"),
    curved: monitorCurvedMap[model.curved] ?? model.curved,
  };
}

export const monitorData: MonitorModel[] = rawMonitorData.map(normalizeMonitor);

function formatMonitorValue(
  namespace: "series" | "panelType" | "resolution" | "curved",
  value: unknown
) {
  const str = String(value);
  const key = `monitorCompare.values.${namespace}.${str}`;
  const result = t(key);
  return result !== key ? result : str;
}

export const monitorSpecRows: SpecRow<MonitorModel>[] = [
  { key: "brand", label: "monitorCompare.brand", format: brandName },
  { key: "series", label: "monitorCompare.series" },
  { key: "launchYear", label: "monitorCompare.launchYear" },
  { key: "size", label: "monitorCompare.size", format: (v) => `${v}"` },
  { key: "resolution", label: "monitorCompare.resolution" },
  { key: "panelType", label: "monitorCompare.panelType" },
  { key: "refreshRate", label: "monitorCompare.refreshRate", format: (v) => `${v} Hz` },
  { key: "responseTime", label: "monitorCompare.responseTime", format: (v) => `${v} ms` },
  { key: "hdr", label: "monitorCompare.hdr" },
  { key: "brightness", label: "monitorCompare.brightness", format: (v) => `${v} nits` },
  { key: "contrastRatio", label: "monitorCompare.contrastRatio" },
  { key: "colorGamut", label: "monitorCompare.colorGamut" },
  { key: "adaptiveSync", label: "monitorCompare.adaptiveSync" },
  { key: "ports", label: "monitorCompare.ports" },
  { key: "curved", label: "monitorCompare.curved", format: (v) => formatMonitorValue("curved", v) },
  { key: "vesa", label: "monitorCompare.vesa" },
];

export const monitorFilterGroups: FilterGroup<MonitorModel>[] = [
  { key: "brand", label: "monitorCompare.brand", format: brandName },
  { key: "series", label: "monitorCompare.series", format: (v) => formatMonitorValue("series", v) },
  { key: "panelType", label: "monitorCompare.panelType", format: (v) => formatMonitorValue("panelType", v) },
  { key: "resolution", label: "monitorCompare.resolution", format: (v) => formatMonitorValue("resolution", v) },
  { key: "curved", label: "monitorCompare.curved", format: (v) => formatMonitorValue("curved", v) },
  { key: "launchYear", label: "monitorCompare.launchYear", format: (val) => String(val) },
];

export const monitorModule: CompareDataModule<MonitorModel> = {
  data: monitorData,
  specRows: monitorSpecRows,
  filterGroups: monitorFilterGroups,
  numericKeys: ["size", "refreshRate", "brightness"],
  inverseKeys: ["responseTime"],
  i18nPrefix: "monitorCompare",
};
