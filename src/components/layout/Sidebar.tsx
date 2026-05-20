import { useState } from "react";
import { useLocation, Link } from "wouter";
import type { SidebarItem } from "@/App";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";
import { useTranslation } from "react-i18next";
import { RefreshCw, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  items: SidebarItem[];
  onRefresh?: () => void;
  onSettings?: () => void;
}

function Sidebar({ items, onRefresh, onSettings }: SidebarProps) {
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 600);
  };
  const [location] = useLocation();

  return (
    <div className="flex w-[220px] shrink-0 flex-col bg-background text-foreground select-none">
      <div className="border-b border-border px-5 pt-6 pb-5 text-center">
        <h1 className="text-lg font-bold tracking-tight">DevTools</h1>
        <p className="mt-1 text-xs text-muted-foreground">Cross-platform utilities</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {items.map((item) => {
          const isActive = location === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`ml-8 mr-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm leading-relaxed transition ${
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-4 py-3 flex items-center justify-center gap-2">
        <button
          type="button"
          className="flex cursor-pointer items-center justify-center rounded-md border border-border bg-accent/40 p-1.5 text-foreground transition hover:bg-accent"
          onClick={handleRefresh}
          title={t("appManager.refresh")}
        >
          <RefreshCw size={14} className={cn(isRefreshing && "animate-spin")} />
        </button>
        <button
          type="button"
          className="flex cursor-pointer items-center justify-center rounded-md border border-border bg-accent/40 p-1.5 text-foreground transition hover:bg-accent"
          onClick={onSettings}
          title={t("sidebar.settings")}
        >
          <Settings size={14} />
        </button>
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
    </div>
  );
}

export default Sidebar;
