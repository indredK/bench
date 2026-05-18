import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap, Monitor, Trash2, Cpu } from "lucide-react";
import Sidebar from "./components/Sidebar";
import PortManager from "./components/PortManager";
import SystemInfo from "./components/SystemInfo";
import DevCleaner from "./components/DevCleaner";
import HardwareComparePage from "./components/HardwareComparePage";

export type Category = "port-manager" | "system-info" | "dev-cleaner" | "hardware-compare";

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
    { id: "hardware-compare", name: t("sidebar.hardwareCompare"), icon: <Cpu size={18} /> },
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
          {activeCategory === "hardware-compare" && (
            <HardwareComparePage />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;