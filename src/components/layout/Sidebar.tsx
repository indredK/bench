import { useLocation, Link } from "wouter";
import type { SidebarItem } from "@/App";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";

interface SidebarProps {
  items: SidebarItem[];
}

function Sidebar({ items }: SidebarProps) {
  const [location] = useLocation();

  return (
    <div className="flex w-[220px] shrink-0 flex-col bg-sidebar text-sidebar-foreground select-none">
      <div className="border-b border-sidebar-border px-5 pt-6 pb-5">
        <h1 className="text-lg font-bold tracking-tight">DevTools</h1>
        <p className="mt-1 text-xs text-sidebar-foreground/60">Cross-platform utilities</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {items.map((item) => {
          const isActive = location === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex cursor-pointer items-center gap-2.5 border-l-[3px] px-5 py-2.5 text-sm leading-relaxed transition ${
                isActive
                  ? "border-l-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-primary-foreground"
                  : "border-l-transparent hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              }`}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-4 py-3 flex items-center justify-center gap-2">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
      <div className="border-t border-sidebar-border px-4 py-3 text-[11px] opacity-50">Tauri v2 Desktop App</div>
    </div>
  );
}

export default Sidebar;
