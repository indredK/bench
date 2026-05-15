import { useState } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "./components/Sidebar";
import PortManager from "./components/PortManager";
import SystemInfo from "./components/SystemInfo";

export type Category = "port-manager" | "system-info";

export interface CategoryInfo {
  id: Category;
  name: string;
  icon: string;
}

function App() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<Category>("port-manager");

  const categories: CategoryInfo[] = [
    { id: "port-manager", name: t("sidebar.portManager"), icon: "⚡" },
    { id: "system-info", name: t("sidebar.systemInfo"), icon: "🖥" },
  ];

  const renderContent = () => {
    switch (activeCategory) {
      case "port-manager":
        return <PortManager />;
      case "system-info":
        return <SystemInfo />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        categories={categories}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden p-4">{renderContent()}</div>
      </div>
    </div>
  );
}

export default App;