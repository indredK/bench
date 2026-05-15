import type { CategoryInfo, Category } from "../App";
import LanguageSwitcher from "./LanguageSwitcher";

interface SidebarProps {
  categories: CategoryInfo[];
  activeCategory: Category;
  onSelectCategory: (id: Category) => void;
}

function Sidebar({ categories, activeCategory, onSelectCategory }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>DevTools</h1>
        <p>Cross-platform utilities</p>
      </div>
      <nav className="sidebar-nav">
        {categories.map((category) => (
          <div
            key={category.id}
            className={`category-item ${activeCategory === category.id ? "active" : ""}`}
            onClick={() => onSelectCategory(category.id)}
          >
            <span className="category-icon">{category.icon}</span>
            <span>{category.name}</span>
          </div>
        ))}
      </nav>
      <div className="sidebar-language">
        <LanguageSwitcher />
      </div>
      <div className="sidebar-footer">Tauri v2 Desktop App</div>
    </div>
  );
}

export default Sidebar;