import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap, Monitor, Trash2, Cpu, HardDrive, MemoryStick, CircuitBoard, Plug, Box, Wind, Network } from "lucide-react";
import Sidebar from "./components/Sidebar";
import PortManager from "./components/PortManager";
import SystemInfo from "./components/SystemInfo";
import DevCleaner from "./components/DevCleaner";
import CpuCompare from "./components/CpuCompare";
import GpuCompare from "./components/GpuCompare";
import MemoryCompare from "./components/MemoryCompare";
import SsdCompare from "./components/SsdCompare";
import MotherboardCompare from "./components/MotherboardCompare";
import MonitorCompare from "./components/MonitorCompare";
import PsuCompare from "./components/PsuCompare";
import CaseCompare from "./components/CaseCompare";
import CoolerCompare from "./components/CoolerCompare";
import SwitchCompare from "./components/SwitchCompare";

export type Category = "port-manager" | "system-info" | "dev-cleaner" | "cpu-compare" | "gpu-compare" | "memory-compare" | "ssd-compare" | "motherboard-compare" | "monitor-compare" | "psu-compare" | "case-compare" | "cooler-compare" | "switch-compare";

export interface CategoryInfo {
  id: Category;
  name: string;
  icon: React.ReactNode;
}

function App() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<Category>("port-manager");

  const categories: CategoryInfo[] = [
    { id: "port-manager", name: t("sidebar.portManager"), icon: <Zap size={18} /> },
    { id: "dev-cleaner", name: t("sidebar.devCleaner"), icon: <Trash2 size={18} /> },
    { id: "system-info", name: t("sidebar.systemInfo"), icon: <Monitor size={18} /> },
    { id: "cpu-compare", name: t("sidebar.cpuCompare"), icon: <Cpu size={18} /> },
    { id: "gpu-compare", name: t("sidebar.gpuCompare"), icon: <Monitor size={18} /> },
    { id: "memory-compare", name: t("sidebar.memoryCompare"), icon: <MemoryStick size={18} /> },
    { id: "ssd-compare", name: t("sidebar.ssdCompare"), icon: <HardDrive size={18} /> },
    { id: "motherboard-compare", name: t("sidebar.motherboardCompare"), icon: <CircuitBoard size={18} /> },
    { id: "monitor-compare", name: t("sidebar.monitorCompare"), icon: <Monitor size={18} /> },
    { id: "psu-compare", name: t("sidebar.psuCompare"), icon: <Plug size={18} /> },
    { id: "case-compare", name: t("sidebar.caseCompare"), icon: <Box size={18} /> },
    { id: "cooler-compare", name: t("sidebar.coolerCompare"), icon: <Wind size={18} /> },
    { id: "switch-compare", name: t("sidebar.switchCompare"), icon: <Network size={18} /> },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        categories={categories}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden p-4">
          {activeCategory === "port-manager" && (
            <div className="h-full">
              <PortManager />
            </div>
          )}
          {activeCategory === "dev-cleaner" && (
            <div className="h-full">
              <DevCleaner />
            </div>
          )}
          {activeCategory === "system-info" && (
            <div className="h-full">
              <SystemInfo active />
            </div>
          )}
          {activeCategory === "cpu-compare" && (
            <div className="h-full overflow-auto">
              <CpuCompare />
            </div>
          )}
          {activeCategory === "gpu-compare" && (
            <div className="h-full overflow-auto">
              <GpuCompare />
            </div>
          )}
          {activeCategory === "memory-compare" && (
            <div className="h-full overflow-auto">
              <MemoryCompare />
            </div>
          )}
          {activeCategory === "ssd-compare" && (
            <div className="h-full overflow-auto">
              <SsdCompare />
            </div>
          )}
          {activeCategory === "motherboard-compare" && (
            <div className="h-full overflow-auto">
              <MotherboardCompare />
            </div>
          )}
          {activeCategory === "monitor-compare" && (
            <div className="h-full overflow-auto">
              <MonitorCompare />
            </div>
          )}
          {activeCategory === "psu-compare" && (
            <div className="h-full overflow-auto">
              <PsuCompare />
            </div>
          )}
          {activeCategory === "case-compare" && (
            <div className="h-full overflow-auto">
              <CaseCompare />
            </div>
          )}
          {activeCategory === "cooler-compare" && (
            <div className="h-full overflow-auto">
              <CoolerCompare />
            </div>
          )}
          {activeCategory === "switch-compare" && (
            <div className="h-full overflow-auto">
              <SwitchCompare />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;