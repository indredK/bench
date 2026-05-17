import type { CompareDataModule, SpecRow } from "@/components/HardwareCompare";

export interface SwitchModel {
  id: string;
  brand: string;
  model: string;
  type: string;
  portCount: number;
  portSpeed: string;
  poeSupport: string;
  switchingCapacity: number;
  forwardingRate: number;
  vlanSupport: string;
  stackable: string;
  management: string;
  formFactor: string;
  launchYear: number;
}

export const switchData: SwitchModel[] = [
  { id: "uswpro48", brand: "Ubiquiti", model: "UniFi Switch Pro 48", type: "Managed", portCount: 48, portSpeed: "1GbE", poeSupport: "32x PoE+ (802.3at) 600W", switchingCapacity: 176, forwardingRate: 130.9, vlanSupport: "Yes", stackable: "No", management: "UniFi Controller", formFactor: "1U Rack", launchYear: 2020 },
  { id: "uswenterprise24", brand: "Ubiquiti", model: "UniFi Switch Enterprise 24", type: "Managed", portCount: 24, portSpeed: "2.5GbE", poeSupport: "12x PoE+ 400W", switchingCapacity: 280, forwardingRate: 208.3, vlanSupport: "Yes", stackable: "No", management: "UniFi Controller", formFactor: "1U Rack", launchYear: 2022 },
  { id: "uswaggregation", brand: "Ubiquiti", model: "UniFi Switch Aggregation", type: "Managed", portCount: 8, portSpeed: "10GbE SFP+", poeSupport: "No", switchingCapacity: 320, forwardingRate: 238.1, vlanSupport: "Yes", stackable: "No", management: "UniFi Controller", formFactor: "1U Rack", launchYear: 2021 },
  { id: "gs190048", brand: "Zyxel", model: "GS1900-48", type: "Smart Managed", portCount: 48, portSpeed: "1GbE", poeSupport: "No", switchingCapacity: 196, forwardingRate: 145.8, vlanSupport: "Yes", stackable: "No", management: "Web / CLI", formFactor: "1U Rack", launchYear: 2019 },
  { id: "tlsg1024d", brand: "TP-Link", model: "TL-SG1024D", type: "Unmanaged", portCount: 24, portSpeed: "1GbE", poeSupport: "No", switchingCapacity: 48, forwardingRate: 35.7, vlanSupport: "No", stackable: "No", management: "None", formFactor: "1U Rack", launchYear: 2020 },
  { id: "tlsg108e", brand: "TP-Link", model: "TL-SG108E", type: "Smart Managed", portCount: 8, portSpeed: "1GbE", poeSupport: "No", switchingCapacity: 16, forwardingRate: 11.9, vlanSupport: "Yes", stackable: "No", management: "Web Utility", formFactor: "Desktop", launchYear: 2019 },
  { id: "flexmini", brand: "Ubiquiti", model: "UniFi Switch Flex Mini", type: "Managed", portCount: 5, portSpeed: "1GbE", poeSupport: "No (PoE Powered)", switchingCapacity: 10, forwardingRate: 7.44, vlanSupport: "Yes", stackable: "No", management: "UniFi Controller", formFactor: "Desktop", launchYear: 2020 },
  { id: "crs326", brand: "MikroTik", model: "CRS326-24G-2S+", type: "Managed (RouterOS)", portCount: 26, portSpeed: "1GbE + 10GbE SFP+", poeSupport: "No", switchingCapacity: 64, forwardingRate: 47.6, vlanSupport: "Yes", stackable: "No", management: "RouterOS / SwOS", formFactor: "1U Rack", launchYear: 2021 },
  { id: "sg35028", brand: "Cisco", model: "SG350-28", type: "Managed", portCount: 28, portSpeed: "1GbE", poeSupport: "No", switchingCapacity: 56, forwardingRate: 41.6, vlanSupport: "Yes", stackable: "Yes", management: "Web / CLI / SNMP", formFactor: "1U Rack", launchYear: 2020 },
  { id: "gs324tp", brand: "Netgear", model: "GS324TP", type: "Smart Managed", portCount: 24, portSpeed: "1GbE", poeSupport: "24x PoE+ 190W", switchingCapacity: 48, forwardingRate: 35.7, vlanSupport: "Yes", stackable: "No", management: "Web", formFactor: "1U Rack", launchYear: 2021 },
  { id: "xs508m", brand: "Netgear", model: "XS508M", type: "Unmanaged", portCount: 8, portSpeed: "10GbE", poeSupport: "No", switchingCapacity: 160, forwardingRate: 119, vlanSupport: "No", stackable: "No", management: "None", formFactor: "Desktop", launchYear: 2022 },
];

export const switchSpecRows: SpecRow<SwitchModel>[] = [
  { key: "brand", label: "switchCompare.brand" },
  { key: "launchYear", label: "switchCompare.launchYear" },
  { key: "type", label: "switchCompare.type" },
  { key: "portCount", label: "switchCompare.portCount" },
  { key: "portSpeed", label: "switchCompare.portSpeed" },
  { key: "poeSupport", label: "switchCompare.poeSupport" },
  { key: "switchingCapacity", label: "switchCompare.switchingCapacity", format: (v) => `${v} Gbps` },
  { key: "forwardingRate", label: "switchCompare.forwardingRate", format: (v) => `${v} Mpps` },
  { key: "vlanSupport", label: "switchCompare.vlanSupport" },
  { key: "stackable", label: "switchCompare.stackable" },
  { key: "management", label: "switchCompare.management" },
  { key: "formFactor", label: "switchCompare.formFactor" },
];

export const switchModule: CompareDataModule<SwitchModel> = {
  data: switchData,
  specRows: switchSpecRows,
  numericKeys: ["portCount", "switchingCapacity", "forwardingRate"],
  inverseKeys: [],
  i18nPrefix: "switchCompare",
};