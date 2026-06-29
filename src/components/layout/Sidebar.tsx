/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 *
 * v2 - 重设计: 删底部 ⚙ Settings 齿轮按钮、删底部 🔄 重启按钮。
 * 只保留语言/主题快捷键。系统设置导航项用分隔线和功能列表分开。
 */
import { useLocation, Link } from "wouter";
import { motion } from "motion/react";
import type { NavigationItem } from "@/features/types";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";
import { useScrambleText } from "@/hooks/useScrambleText";

interface SidebarProps {
  items: NavigationItem[];
  /** Tool/config items shown below separator */
  configItems?: NavigationItem[];
  onRestart?: () => void | Promise<void>;
}

function Sidebar({ items, configItems }: SidebarProps) {
  const { text: titleText, start: scrambleTitle } = useScrambleText({
    target: "DevTools",
    duration: 700,
  });
  const [location] = useLocation();

  return (
    <div className="flex w-[200px] shrink-0 flex-col border-r border-border bg-background text-foreground select-none">
      {/* Smaller header */}
      <div className="border-b border-border px-4 pt-4 pb-3 text-center">
        <h1
          className="text-lg font-bold tracking-tight cursor-default tabular-nums"
          onMouseEnter={scrambleTitle}
        >
          {titleText || " "}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6, ease: "easeOut" }}
          className="mt-0.5 text-[10px] text-muted-foreground"
        >
          Cross-platform utilities
        </motion.p>
      </div>

      {/* Feature navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {items.map((item) => {
          const isActive = location === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`ml-6 mr-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm leading-relaxed transition ${
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

        {/* Separator */}
        {configItems && configItems.length > 0 && (
          <div className="mx-4 my-2 border-t border-border" />
        )}

        {/* Config items (e.g. System Settings) */}
        {configItems?.map((item) => {
          const isActive = location === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`ml-6 mr-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm leading-relaxed transition ${
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

      {/* Bottom: only quick language/theme switchers */}
      <div className="border-t border-border px-3 py-2 flex items-center justify-center gap-1.5">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
    </div>
  );
}

export default Sidebar;
