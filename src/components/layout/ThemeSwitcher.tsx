import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Monitor, Sun, Moon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const THEME_ORDER = ["system", "light", "dark"] as const;
type ThemeMode = (typeof THEME_ORDER)[number];

const ICON_MAP: Record<ThemeMode, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const current = (theme as ThemeMode) || "system";
  const nextIndex = (THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length;
  const nextTheme = THEME_ORDER[nextIndex];

  const Icon = ICON_MAP[current];

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={() => setTheme(nextTheme)}
        className="flex cursor-pointer items-center justify-center rounded-md border border-border bg-accent/40 p-1.5 text-foreground transition hover:bg-accent"
        aria-label={t("theme.label", { mode: t(`theme.${current}`) })}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>
          {t("theme.currentMode")} {t(`theme.${current}`)}
        </p>
        <p className="text-xs text-muted-foreground">{t("theme.tooltip")}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default ThemeSwitcher;
