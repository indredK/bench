/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { useState } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "motion/react";
import type { NavigationItem } from "@/features/types";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";
import { useTranslation } from "react-i18next";
import { RefreshCw, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrambleText } from "@/hooks/useScrambleText";

interface SidebarProps {
  items: NavigationItem[];
  onRefresh?: () => void | Promise<void>;
  onSettings?: () => void;
}

function Sidebar({ items, onRefresh, onSettings }: SidebarProps) {
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { text: titleText, start: scrambleTitle } = useScrambleText({
    target: "DevTools",
    duration: 700,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };
  const [location] = useLocation();

  return (
    <div className="flex w-[220px] shrink-0 flex-col bg-background text-foreground select-none">
      <div className="border-b border-border px-5 pt-6 pb-5 text-center">
        <h1
          className="text-2xl font-bold tracking-tight cursor-default tabular-nums"
          onMouseEnter={scrambleTitle}
        >
          {titleText || " "}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6, ease: "easeOut" }}
          className="mt-1 text-xs text-muted-foreground"
        >
          Cross-platform utilities
        </motion.p>
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
