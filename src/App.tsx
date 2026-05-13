import { useState } from "react";
import Sidebar from "./components/Sidebar";
import PortManager from "./components/PortManager";

export type Category = "port-manager" | "system-info";

export interface CategoryInfo {
  id: Category;
  name: string;
  icon: string;
}

const categories: CategoryInfo[] = [
  { id: "port-manager", name: "Port Manager", icon: "⚡" },
  { id: "system-info", name: "System Info", icon: "🖥" },
];

function App() {
  const [activeCategory, setActiveCategory] = useState<Category>("port-manager");

  const renderContent = () => {
    switch (activeCategory) {
      case "port-manager":
        return <PortManager />;
      case "system-info":
        return (
          <div className="empty-state">
            <div className="empty-icon">🚧</div>
            <p>System Info module is under development</p>
          </div>
        );
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
        </div>
        <div className="main-body">{renderContent()}</div>
      </div>
    </div>
  );
}

export default App;