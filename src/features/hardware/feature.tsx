import { Cpu } from "lucide-react";
import HardwareComparePage from "@/components/pages/HardwareComparePage";
import type { AppFeature } from "@/features/types";

export const hardwareFeature: AppFeature = {
  id: "hardware",
  path: "/hardware",
  labelKey: "sidebar.hardwareQuery",
  icon: <Cpu size={18} />,
  render: () => <HardwareComparePage />,
};
