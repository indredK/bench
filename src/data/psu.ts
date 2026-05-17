import type { CompareDataModule, SpecRow } from "@/components/HardwareCompare";

export interface PsuModel {
  id: string;
  brand: string;
  model: string;
  wattage: number;
  efficiency: string;
  modularType: string;
  fanSize: number;
  pcieGen5: string;
  atxVersion: string;
  dimensions: string;
  warranty: string;
  launchYear: number;
}

export const psuData: PsuModel[] = [
  { id: "rme1000", brand: "Corsair", model: "RM1000e", wattage: 1000, efficiency: "80+ Gold", modularType: "Full", fanSize: 120, pcieGen5: "Yes (12VHPWR)", atxVersion: "ATX 3.0", dimensions: "150×86×140mm", warranty: "7 years", launchYear: 2023 },
  { id: "hx1500i", brand: "Corsair", model: "HX1500i", wattage: 1500, efficiency: "80+ Platinum", modularType: "Full", fanSize: 140, pcieGen5: "Yes", atxVersion: "ATX 3.1", dimensions: "200×86×150mm", warranty: "10 years", launchYear: 2024 },
  { id: "rmxshift1200", brand: "Corsair", model: "RMx Shift 1200", wattage: 1200, efficiency: "80+ Gold", modularType: "Full (Side)", fanSize: 140, pcieGen5: "Yes (12VHPWR x2)", atxVersion: "ATX 3.0", dimensions: "160×86×150mm", warranty: "10 years", launchYear: 2023 },
  { id: "sp1200", brand: "SeaSonic", model: "Prime TX-1600", wattage: 1600, efficiency: "80+ Titanium", modularType: "Full", fanSize: 135, pcieGen5: "Yes (12V-2x6 x2)", atxVersion: "ATX 3.1", dimensions: "210×86×150mm", warranty: "12 years", launchYear: 2024 },
  { id: "focus1000", brand: "SeaSonic", model: "Focus GX-1000", wattage: 1000, efficiency: "80+ Gold", modularType: "Full", fanSize: 120, pcieGen5: "Yes (12VHPWR)", atxVersion: "ATX 3.0", dimensions: "140×86×150mm", warranty: "10 years", launchYear: 2023 },
  { id: "sp850", brand: "SeaSonic", model: "Focus SGX-850 (SFX)", wattage: 850, efficiency: "80+ Platinum", modularType: "Full", fanSize: 92, pcieGen5: "Yes", atxVersion: "ATX 3.1", dimensions: "125×63.5×100mm", warranty: "10 years", launchYear: 2024 },
  { id: "dark13", brand: "be quiet!", model: "Dark Power 13 1000W", wattage: 1000, efficiency: "80+ Titanium", modularType: "Full", fanSize: 135, pcieGen5: "Yes (12VHPWR)", atxVersion: "ATX 3.0", dimensions: "175×86×150mm", warranty: "10 years", launchYear: 2023 },
  { id: "darkpro13", brand: "be quiet!", model: "Dark Power Pro 13 1600W", wattage: 1600, efficiency: "80+ Titanium", modularType: "Full", fanSize: 135, pcieGen5: "Yes (12VHPWR x2)", atxVersion: "ATX 3.0", dimensions: "200×86×150mm", warranty: "10 years", launchYear: 2023 },
  { id: "thor1600", brand: "ASUS", model: "ROG Thor 1600T", wattage: 1600, efficiency: "80+ Titanium", modularType: "Full", fanSize: 135, pcieGen5: "Yes (12V-2x6 x2)", atxVersion: "ATX 3.1", dimensions: "190×86×150mm", warranty: "10 years", launchYear: 2024 },
  { id: "toughpower1650", brand: "Thermaltake", model: "Toughpower GF3 1650W", wattage: 1650, efficiency: "80+ Gold", modularType: "Full", fanSize: 140, pcieGen5: "Yes (12VHPWR x2)", atxVersion: "ATX 3.0", dimensions: "180×86×150mm", warranty: "10 years", launchYear: 2023 },
  { id: "sf1000l", brand: "Corsair", model: "SF1000L (SFX-L)", wattage: 1000, efficiency: "80+ Gold", modularType: "Full", fanSize: 120, pcieGen5: "Yes (12VHPWR)", atxVersion: "ATX 3.0", dimensions: "130×63.5×125mm", warranty: "7 years", launchYear: 2024 },
];

export const psuSpecRows: SpecRow<PsuModel>[] = [
  { key: "brand", label: "psuCompare.brand" },
  { key: "launchYear", label: "psuCompare.launchYear" },
  { key: "wattage", label: "psuCompare.wattage", format: (v) => `${v} W` },
  { key: "efficiency", label: "psuCompare.efficiency" },
  { key: "modularType", label: "psuCompare.modularType" },
  { key: "fanSize", label: "psuCompare.fanSize", format: (v) => `${v} mm` },
  { key: "pcieGen5", label: "psuCompare.pcieGen5" },
  { key: "atxVersion", label: "psuCompare.atxVersion" },
  { key: "dimensions", label: "psuCompare.dimensions" },
  { key: "warranty", label: "psuCompare.warranty" },
];

export const psuModule: CompareDataModule<PsuModel> = {
  data: psuData,
  specRows: psuSpecRows,
  numericKeys: ["wattage", "fanSize"],
  inverseKeys: [],
  i18nPrefix: "psuCompare",
};