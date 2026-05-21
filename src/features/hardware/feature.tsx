import { Cpu } from "lucide-react";
import HardwareComparePage from "@/features/hardware/page";
import type { AppFeature } from "@/features/types";

export const hardwareFeature: AppFeature = {
  id: "hardware",
  path: "/hardware",
  labelKey: "sidebar.hardwareQuery",
  icon: <Cpu size={18} />,
  render: () => <HardwareComparePage />,
};
