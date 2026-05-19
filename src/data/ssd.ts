import type { CompareDataModule, SpecRow, FilterGroup } from "@/features/compare/types";
import { brandName } from "@/lib/i18nBrand";
import { t } from "i18next";

export interface SsdModel {
  id: string;
  brand: string;
  series: string;
  model: string;
  launchYear: number;
  capacity: number;
  formFactor: string;
  interfaceType: string;
  nandType: string;
  controller: string;
  dramCache: string;
  seqRead: number;
  seqWrite: number;
  randomRead: number;
  randomWrite: number;
  tbw: number;
  mtbf: number;
  warranty: string;
  hasHeatsink: string;
}

export const ssdData: SsdModel[] = [
  { id: "990pro2", brand: "Samsung", series: "990 Pro", model: "990 Pro 2TB", launchYear: 2022, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "V-NAND V7", controller: "Samsung Pascal", dramCache: "2 GB LPDDR4", seqRead: 7450, seqWrite: 6900, randomRead: 1400, randomWrite: 1550, tbw: 1200, mtbf: 1.5, warranty: "5 years", hasHeatsink: "Optional" },
  { id: "980pro2", brand: "Samsung", series: "980 Pro", model: "980 Pro 2TB", launchYear: 2020, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "V-NAND V6 TLC", controller: "Samsung Elpis", dramCache: "2 GB LPDDR4", seqRead: 7000, seqWrite: 5100, randomRead: 1000, randomWrite: 1000, tbw: 1200, mtbf: 1.5, warranty: "5 years", hasHeatsink: "No" },
  { id: "990pro4", brand: "Samsung", series: "990 Pro", model: "990 Pro 4TB", launchYear: 2023, capacity: 4000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "V-NAND V7", controller: "Samsung Pascal", dramCache: "4 GB LPDDR4", seqRead: 7450, seqWrite: 6900, randomRead: 1400, randomWrite: 1550, tbw: 2400, mtbf: 1.5, warranty: "5 years", hasHeatsink: "Optional" },
  { id: "9100pro2", brand: "Samsung", series: "9100 Pro", model: "9100 Pro 2TB", launchYear: 2025, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 5.0 x4", nandType: "V-NAND V8", controller: "Samsung Presto", dramCache: "2 GB LPDDR4", seqRead: 14800, seqWrite: 13400, randomRead: 2200, randomWrite: 2600, tbw: 2400, mtbf: 2.0, warranty: "5 years", hasHeatsink: "Included" },
  { id: "sn850x2", brand: "WD", series: "Black SN850X", model: "Black SN850X 2TB", launchYear: 2022, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "BiCS5 TLC", controller: "WD G2", dramCache: "2 GB DDR4", seqRead: 7300, seqWrite: 6600, randomRead: 1200, randomWrite: 1100, tbw: 1200, mtbf: 1.75, warranty: "5 years", hasHeatsink: "Optional" },
  { id: "sn7702", brand: "WD", series: "Black SN770", model: "Black SN770 2TB", launchYear: 2022, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "BiCS5 TLC", controller: "WD G2 (DRAM-less)", dramCache: "None (HMB)", seqRead: 5150, seqWrite: 4900, randomRead: 650, randomWrite: 800, tbw: 1200, mtbf: 1.75, warranty: "5 years", hasHeatsink: "No" },
  { id: "sn5801", brand: "WD", series: "Black SN580", model: "Black SN580 1TB", launchYear: 2023, capacity: 1000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "BiCS5 TLC", controller: "WD G3 (DRAM-less)", dramCache: "None (HMB)", seqRead: 4150, seqWrite: 4150, randomRead: 600, randomWrite: 750, tbw: 600, mtbf: 1.75, warranty: "5 years", hasHeatsink: "No" },
  { id: "sn50002", brand: "WD", series: "Black SN5000", model: "Black SN5000 1TB", launchYear: 2024, capacity: 1000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "BiCS6 TLC", controller: "WD G3", dramCache: "1 GB DDR4", seqRead: 6800, seqWrite: 5200, randomRead: 800, randomWrite: 900, tbw: 900, mtbf: 1.75, warranty: "5 years", hasHeatsink: "No" },
  { id: "t7002", brand: "Crucial", series: "T700", model: "T700 2TB", launchYear: 2023, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 5.0 x4", nandType: "232L TLC", controller: "Phison E26", dramCache: "4 GB LPDDR4", seqRead: 12400, seqWrite: 11800, randomRead: 1500, randomWrite: 1500, tbw: 1200, mtbf: 1.6, warranty: "5 years", hasHeatsink: "Included" },
  { id: "t5002", brand: "Crucial", series: "T500", model: "T500 2TB", launchYear: 2023, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "232L TLC", controller: "Phison E25", dramCache: "2 GB LPDDR4", seqRead: 7400, seqWrite: 7000, randomRead: 1180, randomWrite: 1440, tbw: 1200, mtbf: 1.6, warranty: "5 years", hasHeatsink: "Optional" },
  { id: "p44pro2", brand: "SK Hynix", series: "Platinum P41", model: "Platinum P41 2TB", launchYear: 2022, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "176L TLC", controller: "Aries", dramCache: "2 GB LPDDR4", seqRead: 7000, seqWrite: 6500, randomRead: 1400, randomWrite: 1300, tbw: 1200, mtbf: 1.5, warranty: "5 years", hasHeatsink: "No" },
  { id: "kc30002", brand: "Kingston", series: "KC3000", model: "KC3000 2TB", launchYear: 2021, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "176L TLC", controller: "Phison E18", dramCache: "2 GB DDR4", seqRead: 7000, seqWrite: 7000, randomRead: 1000, randomWrite: 1000, tbw: 1600, mtbf: 1.8, warranty: "5 years", hasHeatsink: "No" },
  { id: "firecuda2", brand: "Seagate", series: "FireCuda 540", model: "FireCuda 540 2TB", launchYear: 2024, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 5.0 x4", nandType: "232L TLC", controller: "Phison E26", dramCache: "4 GB LPDDR4", seqRead: 11800, seqWrite: 11800, randomRead: 1500, randomWrite: 1500, tbw: 2000, mtbf: 1.8, warranty: "5 years", hasHeatsink: "No" },
  { id: "mp7002", brand: "Corsair", series: "MP700", model: "MP700 Pro 2TB", launchYear: 2024, capacity: 2000, formFactor: "M.2 2280", interfaceType: "PCIe 5.0 x4", nandType: "232L TLC", controller: "Phison E26", dramCache: "4 GB LPDDR4", seqRead: 12400, seqWrite: 11800, randomRead: 1500, randomWrite: 1600, tbw: 1400, mtbf: 1.6, warranty: "5 years", hasHeatsink: "Yes" },
  { id: "870evo4", brand: "Samsung", series: "870 EVO", model: "870 EVO 4TB", launchYear: 2021, capacity: 4000, formFactor: "2.5 inch", interfaceType: "SATA 6Gb/s", nandType: "V-NAND V6 TLC", controller: "Samsung MKX", dramCache: "4 GB LPDDR4", seqRead: 560, seqWrite: 530, randomRead: 98, randomWrite: 88, tbw: 2400, mtbf: 1.5, warranty: "5 years", hasHeatsink: "No" },
  { id: "mx5004", brand: "Crucial", series: "MX500", model: "MX500 4TB", launchYear: 2022, capacity: 4000, formFactor: "2.5 inch", interfaceType: "SATA 6Gb/s", nandType: "176L TLC", controller: "Silicon Motion SM2259", dramCache: "2 GB DDR3", seqRead: 560, seqWrite: 510, randomRead: 95, randomWrite: 90, tbw: 1000, mtbf: 1.8, warranty: "5 years", hasHeatsink: "No" },
  { id: "tforced4", brand: "TeamGroup", series: "Cardea A440", model: "T-Force Cardea A440 Pro 4TB", launchYear: 2023, capacity: 4000, formFactor: "M.2 2280", interfaceType: "PCIe 4.0 x4", nandType: "176L TLC", controller: "Phison E18", dramCache: "4 GB DDR4", seqRead: 7000, seqWrite: 6900, randomRead: 1000, randomWrite: 1000, tbw: 3000, mtbf: 1.7, warranty: "5 years", hasHeatsink: "Yes" },
];

export const ssdSpecRows: SpecRow<SsdModel>[] = [
  { key: "brand", label: "ssdCompare.brand", format: brandName },
  { key: "series", label: "ssdCompare.series" },
  { key: "launchYear", label: "ssdCompare.launchYear" },
  { key: "capacity", label: "ssdCompare.capacity", format: (v) => `${v} GB` },
  { key: "formFactor", label: "ssdCompare.formFactor" },
  { key: "interfaceType", label: "ssdCompare.interfaceType" },
  { key: "nandType", label: "ssdCompare.nandType" },
  { key: "controller", label: "ssdCompare.controller" },
  { key: "dramCache", label: "ssdCompare.dramCache" },
  { key: "seqRead", label: "ssdCompare.seqRead", format: (v) => `${v} MB/s` },
  { key: "seqWrite", label: "ssdCompare.seqWrite", format: (v) => `${v} MB/s` },
  { key: "randomRead", label: "ssdCompare.randomRead", format: (v) => `${v}K IOPS` },
  { key: "randomWrite", label: "ssdCompare.randomWrite", format: (v) => `${v}K IOPS` },
  { key: "tbw", label: "ssdCompare.tbw", format: (v) => `${v} TB` },
  { key: "mtbf", label: "ssdCompare.mtbf", format: (v) => `${v}M hours` },
  { key: "warranty", label: "ssdCompare.warranty" },
  { key: "hasHeatsink", label: "ssdCompare.hasHeatsink", format: (v) => { const s = String(v); return s === "Yes" ? t("common.yes") : s === "No" ? t("common.no") : s === "Optional" ? t("common.optional") : s === "Included" ? t("common.included") : s; } },
];

export const ssdFilterGroups: FilterGroup<SsdModel>[] = [
  { key: "brand", label: "ssdCompare.brand", format: brandName },
  { key: "series", label: "ssdCompare.series", format: (v) => { const str = String(v); const key = `ssdCompare.values.series.${str}`; const result = t(key); return result !== key ? result : str; } },
  { key: "interfaceType", label: "ssdCompare.interfaceType", format: (v) => { const str = String(v); const key = `ssdCompare.values.interfaceType.${str}`; const result = t(key); return result !== key ? result : str; } },
  { key: "formFactor", label: "ssdCompare.formFactor", format: (v) => { const str = String(v); const key = `ssdCompare.values.formFactor.${str}`; const result = t(key); return result !== key ? result : str; } },
];

export const ssdModule: CompareDataModule<SsdModel> = {
  data: ssdData,
  specRows: ssdSpecRows,
  filterGroups: ssdFilterGroups,
  numericKeys: ["capacity", "seqRead", "seqWrite", "randomRead", "randomWrite", "tbw", "mtbf"],
  inverseKeys: [],
  i18nPrefix: "ssdCompare",
};
