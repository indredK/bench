import type { CategoryInfo, Category } from "../App";
import LanguageSwitcher from "./LanguageSwitcher";

interface SidebarProps {
  categories: CategoryInfo[];
  activeCategory: Category;
  onSelectCategory: (id: Category) => void;
}

function Sidebar({ categories, activeCategory, onSelectCategory }: SidebarProps) {
  return (
    <div className="flex w-[220px] shrink-0 flex-col bg-indigo-950 text-indigo-200 select-none">
      <div className="border-b border-white/10 px-5 pt-6 pb-5">
        <h1 className="text-lg font-bold text-white tracking-tight">DevTools</h1>
        <p className="mt-1 text-xs text-indigo-300/70">Cross-platform utilities</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {categories.map((category) => (
          <div
            key={category.id}
            className={`flex cursor-pointer items-center gap-2.5 border-l-[3px] px-5 py-2.5 text-sm leading-relaxed transition ${
              activeCategory === category.id
                ? "border-l-indigo-400 bg-white/12 font-semibold text-white"
                : "border-l-transparent hover:bg-white/8 hover:text-white"
            }`}
            onClick={() => onSelectCategory(category.id)}
          >
            <span className="flex size-5 shrink-0 items-center justify-center">{category.icon}</span>
            <span>{category.name}</span>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <LanguageSwitcher />
      </div>
      <div className="border-t border-white/10 px-4 py-3 text-[11px] opacity-50">Tauri v2 Desktop App</div>
    </div>
  );
}

export default Sidebar;