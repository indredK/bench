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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  items: NavigationItem[];
  onRestart?: () => void | Promise<void>;
  onSettings?: () => void;
}

function Sidebar({ items, onRestart, onSettings }: SidebarProps) {
  const { t } = useTranslation();
  const [isRestarting, setIsRestarting] = useState(false);
  const { text: titleText, start: scrambleTitle } = useScrambleText({
    target: "DevTools",
    duration: 700,
  });

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await onRestart?.();
    } finally {
      setTimeout(() => setIsRestarting(false), 600);
    }
  };
  const [location] = useLocation();
  const restartTooltipText = t("sidebar.restart");
  const settingsTooltipText = t("sidebar.settings");

  return (
    <div className="flex w-[220px] shrink-0 flex-col border-r border-border bg-background text-foreground select-none">
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
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-4 py-3 flex items-center justify-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                className="flex cursor-pointer items-center justify-center rounded-md border border-border bg-background/70 p-1.5 text-foreground transition hover:bg-muted/70"
                onClick={handleRestart}
                aria-label={restartTooltipText}
              >
                <RefreshCw size={14} className={cn(isRestarting && "animate-spin")} />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{restartTooltipText}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex cursor-pointer items-center justify-center rounded-md border border-border bg-background/70 p-1.5 text-foreground transition hover:bg-muted/70"
              onClick={onSettings}
              aria-label={settingsTooltipText}
            >
              <Settings size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{settingsTooltipText}</p>
          </TooltipContent>
        </Tooltip>
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
    </div>
  );
}

export default Sidebar;
