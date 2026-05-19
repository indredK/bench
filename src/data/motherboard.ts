import type { CompareDataModule, SpecRow, FilterGroup } from "@/features/compare/types";
import { brandName } from "@/lib/i18nBrand";
import { t } from "i18next";

export interface MotherboardModel {
  id: string;
  brand: string;
  series: string;
  model: string;
  launchYear: number;
  socket: string;
  chipset: string;
  formFactor: string;
  memorySlots: number;
  maxMemory: number;
  memoryType: string;
  memorySpeed: string;
  pcieSlots: string;
  m2Slots: string;
  sataPorts: number;
  usbPortsBack: string;
  usbTypeC: string;
  wifi: string;
  ethernet: string;
  audio: string;
  biosFlashback: string;
  rgbHeaders: string;
}

export const motherboardData: MotherboardModel[] = [
  { id: "z790hero", brand: "ASUS", series: "ROG Maximus", model: "ROG Maximus Z790 Hero", launchYear: 2022, socket: "LGA1700", chipset: "Z790", formFactor: "ATX", memorySlots: 4, maxMemory: 192, memoryType: "DDR5", memorySpeed: "7800+ OC", pcieSlots: "2x PCIe 5.0 x16, 1x PCIe 4.0 x16", m2Slots: "5x M.2 (1x 5.0)", sataPorts: 6, usbPortsBack: "10x USB-A", usbTypeC: "2x Thunderbolt 4", wifi: "Wi-Fi 6E", ethernet: "2.5GbE + 10GbE", audio: "ROG SupremeFX ALC4082", biosFlashback: "Yes", rgbHeaders: "3x ARGB, 1x RGB" },
  { id: "z790ace", brand: "MSI", series: "MEG", model: "MEG Z790 ACE", launchYear: 2022, socket: "LGA1700", chipset: "Z790", formFactor: "ATX", memorySlots: 4, maxMemory: 192, memoryType: "DDR5", memorySpeed: "7800+ OC", pcieSlots: "2x PCIe 5.0 x16, 1x PCIe 4.0 x4", m2Slots: "5x M.2 (1x 5.0)", sataPorts: 6, usbPortsBack: "9x USB-A", usbTypeC: "1x Thunderbolt 4", wifi: "Wi-Fi 6E", ethernet: "2.5GbE", audio: "Realtek ALC4080", biosFlashback: "Yes", rgbHeaders: "4x ARGB, 1x RGB" },
  { id: "z790master", brand: "Gigabyte", series: "Aorus", model: "Z790 Aorus Master", launchYear: 2022, socket: "LGA1700", chipset: "Z790", formFactor: "E-ATX", memorySlots: 4, maxMemory: 192, memoryType: "DDR5", memorySpeed: "8000+ OC", pcieSlots: "1x PCIe 5.0 x16, 2x PCIe 4.0 x4", m2Slots: "5x M.2 (1x 5.0)", sataPorts: 4, usbPortsBack: "10x USB-A", usbTypeC: "1x USB 3.2 20Gbps", wifi: "Wi-Fi 6E", ethernet: "10GbE", audio: "Realtek ALC1220-VB", biosFlashback: "Yes", rgbHeaders: "2x ARGB, 2x RGB" },
  { id: "z790strix", brand: "ASUS", series: "ROG Strix", model: "ROG Strix Z790-F Gaming", launchYear: 2023, socket: "LGA1700", chipset: "Z790", formFactor: "ATX", memorySlots: 4, maxMemory: 192, memoryType: "DDR5", memorySpeed: "7800+ OC", pcieSlots: "1x PCIe 5.0 x16, 2x PCIe 4.0 x4", m2Slots: "4x M.2 (1x 5.0)", sataPorts: 4, usbPortsBack: "10x USB-A", usbTypeC: "1x USB 3.2 20Gbps", wifi: "Wi-Fi 6E", ethernet: "2.5GbE", audio: "ROG SupremeFX ALC4080", biosFlashback: "Yes", rgbHeaders: "3x ARGB, 1x RGB" },
  { id: "x670ehero", brand: "ASUS", series: "ROG Crosshair", model: "ROG Crosshair X670E Hero", launchYear: 2022, socket: "AM5", chipset: "X670E", formFactor: "ATX", memorySlots: 4, maxMemory: 192, memoryType: "DDR5", memorySpeed: "6400+ OC", pcieSlots: "2x PCIe 5.0 x16, 1x PCIe 4.0 x4", m2Slots: "5x M.2 (2x 5.0)", sataPorts: 6, usbPortsBack: "12x USB-A", usbTypeC: "2x USB 4.0", wifi: "Wi-Fi 6E", ethernet: "2.5GbE", audio: "ROG SupremeFX ALC4082", biosFlashback: "Yes", rgbHeaders: "3x ARGB, 1x RGB" },
  { id: "x670eace", brand: "MSI", series: "MEG", model: "MEG X670E ACE", launchYear: 2022, socket: "AM5", chipset: "X670E", formFactor: "E-ATX", memorySlots: 4, maxMemory: 256, memoryType: "DDR5", memorySpeed: "6666+ OC", pcieSlots: "3x PCIe 5.0 x16", m2Slots: "4x M.2 (2x 5.0)", sataPorts: 8, usbPortsBack: "10x USB-A", usbTypeC: "1x USB 4.0", wifi: "Wi-Fi 6E", ethernet: "10GbE", audio: "Realtek ALC4082", biosFlashback: "Yes", rgbHeaders: "3x ARGB, 1x RGB" },
  { id: "x870ecarbon", brand: "MSI", series: "MPG", model: "MPG X870E Carbon WiFi", launchYear: 2024, socket: "AM5", chipset: "X870E", formFactor: "ATX", memorySlots: 4, maxMemory: 256, memoryType: "DDR5", memorySpeed: "8000+ OC", pcieSlots: "2x PCIe 5.0 x16, 1x PCIe 4.0 x4", m2Slots: "5x M.2 (2x 5.0)", sataPorts: 4, usbPortsBack: "10x USB-A", usbTypeC: "2x USB 4.0", wifi: "Wi-Fi 7", ethernet: "5GbE", audio: "Realtek ALC4080", biosFlashback: "Yes", rgbHeaders: "3x ARGB, 1x RGB" },
  { id: "z890apex", brand: "ASUS", series: "ROG Maximus", model: "ROG Maximus Z890 Apex", launchYear: 2024, socket: "LGA1851", chipset: "Z890", formFactor: "ATX", memorySlots: 2, maxMemory: 96, memoryType: "DDR5", memorySpeed: "9000+ OC", pcieSlots: "2x PCIe 5.0 x16", m2Slots: "6x M.2 (2x 5.0)", sataPorts: 4, usbPortsBack: "8x USB-A", usbTypeC: "2x Thunderbolt 5", wifi: "Wi-Fi 7", ethernet: "2.5GbE", audio: "ROG SupremeFX ALC4080", biosFlashback: "Yes", rgbHeaders: "3x ARGB" },
  { id: "b650etomahawk", brand: "MSI", series: "MAG", model: "MAG B650 Tomahawk WiFi", launchYear: 2022, socket: "AM5", chipset: "B650", formFactor: "ATX", memorySlots: 4, maxMemory: 192, memoryType: "DDR5", memorySpeed: "6400+ OC", pcieSlots: "1x PCIe 4.0 x16, 1x PCIe 4.0 x4, 1x PCIe 3.0 x1", m2Slots: "3x M.2 (1x 5.0)", sataPorts: 6, usbPortsBack: "7x USB-A", usbTypeC: "1x USB 3.2 20Gbps", wifi: "Wi-Fi 6E", ethernet: "2.5GbE", audio: "Realtek ALC4080", biosFlashback: "Yes", rgbHeaders: "2x ARGB, 1x RGB" },
  { id: "b650eaorus", brand: "Gigabyte", series: "Aorus", model: "B650E Aorus Master", launchYear: 2023, socket: "AM5", chipset: "B650E", formFactor: "ATX", memorySlots: 4, maxMemory: 192, memoryType: "DDR5", memorySpeed: "6666+ OC", pcieSlots: "1x PCIe 5.0 x16, 2x PCIe 4.0 x4", m2Slots: "4x M.2 (2x 5.0)", sataPorts: 4, usbPortsBack: "9x USB-A", usbTypeC: "1x USB 3.2 20Gbps", wifi: "Wi-Fi 6E", ethernet: "2.5GbE", audio: "Realtek ALC1220", biosFlashback: "Yes", rgbHeaders: "2x ARGB, 2x RGB" },
  { id: "z890carbon", brand: "MSI", series: "MEG", model: "MEG Z890 Ace", launchYear: 2024, socket: "LGA1851", chipset: "Z890", formFactor: "ATX", memorySlots: 4, maxMemory: 256, memoryType: "DDR5", memorySpeed: "9200+ OC", pcieSlots: "2x PCIe 5.0 x16, 1x PCIe 4.0 x4", m2Slots: "5x M.2 (2x 5.0)", sataPorts: 4, usbPortsBack: "12x USB-A", usbTypeC: "2x Thunderbolt 5", wifi: "Wi-Fi 7", ethernet: "10GbE", audio: "Realtek ALC4082", biosFlashback: "Yes", rgbHeaders: "4x ARGB, 1x RGB" },
  { id: "b650steellegend", brand: "ASRock", series: "Steel Legend", model: "B650 Steel Legend WiFi", launchYear: 2023, socket: "AM5", chipset: "B650", formFactor: "ATX", memorySlots: 4, maxMemory: 192, memoryType: "DDR5", memorySpeed: "7200+ OC", pcieSlots: "1x PCIe 5.0 x16, 1x PCIe 4.0 x16, 1x PCIe 4.0 x4, 1x PCIe 3.0 x1", m2Slots: "3x M.2 (1x 5.0)", sataPorts: 4, usbPortsBack: "8x USB-A", usbTypeC: "1x USB 3.2 20Gbps", wifi: "Wi-Fi 6E", ethernet: "2.5GbE", audio: "Realtek ALC897", biosFlashback: "Yes", rgbHeaders: "3x ARGB, 1x RGB" },
  { id: "x670etaichi", brand: "ASRock", series: "Taichi", model: "X670E Taichi", launchYear: 2022, socket: "AM5", chipset: "X670E", formFactor: "E-ATX", memorySlots: 4, maxMemory: 192, memoryType: "DDR5", memorySpeed: "6600+ OC", pcieSlots: "2x PCIe 5.0 x16, 1x PCIe 4.0 x16", m2Slots: "5x M.2 (2x 5.0)", sataPorts: 8, usbPortsBack: "8x USB-A", usbTypeC: "1x USB 4.0", wifi: "Wi-Fi 6E", ethernet: "2.5GbE + 10GbE", audio: "Realtek ALC4082", biosFlashback: "Yes", rgbHeaders: "3x ARGB, 1x RGB" },
  { id: "z790nova", brand: "ASRock", series: "Nova", model: "Z790 Nova WiFi", launchYear: 2023, socket: "LGA1700", chipset: "Z790", formFactor: "ATX", memorySlots: 4, maxMemory: 256, memoryType: "DDR5", memorySpeed: "8000+ OC", pcieSlots: "2x PCIe 5.0 x16, 1x PCIe 4.0 x4", m2Slots: "5x M.2 (1x 5.0)", sataPorts: 4, usbPortsBack: "9x USB-A", usbTypeC: "1x USB 3.2 20Gbps", wifi: "Wi-Fi 7", ethernet: "2.5GbE", audio: "Realtek ALC1220", biosFlashback: "Yes", rgbHeaders: "3x ARGB, 1x RGB" },
];

export const motherboardSpecRows: SpecRow<MotherboardModel>[] = [
  { key: "brand", label: "motherboardCompare.brand", format: brandName },
  { key: "series", label: "motherboardCompare.series" },
  { key: "launchYear", label: "motherboardCompare.launchYear" },
  { key: "socket", label: "motherboardCompare.socket" },
  { key: "chipset", label: "motherboardCompare.chipset" },
  { key: "formFactor", label: "motherboardCompare.formFactor" },
  { key: "memorySlots", label: "motherboardCompare.memorySlots" },
  { key: "maxMemory", label: "motherboardCompare.maxMemory", format: (v) => `${v} GB` },
  { key: "memoryType", label: "motherboardCompare.memoryType" },
  { key: "memorySpeed", label: "motherboardCompare.memorySpeed" },
  { key: "pcieSlots", label: "motherboardCompare.pcieSlots" },
  { key: "m2Slots", label: "motherboardCompare.m2Slots" },
  { key: "sataPorts", label: "motherboardCompare.sataPorts" },
  { key: "usbPortsBack", label: "motherboardCompare.usbPortsBack" },
  { key: "usbTypeC", label: "motherboardCompare.usbTypeC" },
  { key: "wifi", label: "motherboardCompare.wifi" },
  { key: "ethernet", label: "motherboardCompare.ethernet" },
  { key: "audio", label: "motherboardCompare.audio" },
  { key: "biosFlashback", label: "motherboardCompare.biosFlashback" },
  { key: "rgbHeaders", label: "motherboardCompare.rgbHeaders" },
];

export const motherboardFilterGroups: FilterGroup<MotherboardModel>[] = [
  { key: "brand", label: "motherboardCompare.brand", format: brandName },
  { key: "series", label: "motherboardCompare.series", format: (v) => { const str = String(v); const key = `motherboardCompare.values.series.${str}`; const result = t(key); return result !== key ? result : str; } },
  { key: "socket", label: "motherboardCompare.socket", format: (v) => { const str = String(v); const key = `motherboardCompare.values.socket.${str}`; const result = t(key); return result !== key ? result : str; } },
  { key: "chipset", label: "motherboardCompare.chipset", format: (v) => { const str = String(v); const key = `motherboardCompare.values.chipset.${str}`; const result = t(key); return result !== key ? result : str; } },
  { key: "formFactor", label: "motherboardCompare.formFactor", format: (v) => { const str = String(v); const key = `motherboardCompare.values.formFactor.${str}`; const result = t(key); return result !== key ? result : str; } },
];

export const motherboardModule: CompareDataModule<MotherboardModel> = {
  data: motherboardData,
  specRows: motherboardSpecRows,
  filterGroups: motherboardFilterGroups,
  numericKeys: ["memorySlots", "maxMemory", "sataPorts"],
  inverseKeys: [],
  i18nPrefix: "motherboardCompare",
};
