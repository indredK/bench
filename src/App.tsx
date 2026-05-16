import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap, Monitor, Trash2 } from "lucide-react";
import Sidebar from "./components/Sidebar";
import PortManager from "./components/PortManager";
import SystemInfo from "./components/SystemInfo";
import DevCleaner from "./components/DevCleaner";

export type Category = "port-manager" | "system-info" | "dev-cleaner";

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
          <div className="h-full" style={{ display: activeCategory === "port-manager" ? "block" : "none" }}>
            <PortManager />
          </div>
          <div className="h-full" style={{ display: activeCategory === "dev-cleaner" ? "block" : "none" }}>
            <DevCleaner />
          </div>
          <div className="h-full" style={{ display: activeCategory === "system-info" ? "block" : "none" }}>
            <SystemInfo active={activeCategory === "system-info"} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;