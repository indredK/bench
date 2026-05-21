/**
 * Feature Descriptor / 功能描述: expose route metadata; 只暴露路由元数据.
 */
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
