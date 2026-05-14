import { useState } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "./components/Sidebar";
import PortManager from "./components/PortManager";
import SystemInfo from "./components/SystemInfo";
import LanguageSwitcher from "./components/LanguageSwitcher";

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

  const activeInfo = categories.find((c) => c.id === activeCategory);

  return (
    <div className="app-container">
      <Sidebar
        categories={categories}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
      />
      <div className="main-content">
        <div className="main-header">
          <span className="header-icon">{activeInfo?.icon}</span>
          <h2>{activeInfo?.name}</h2>
          <LanguageSwitcher />
        </div>
        <div className="main-body">{renderContent()}</div>
      </div>
    </div>
  );
}

export default App;