/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { canUseWindowControls } from "@/platform/window";
import { getCurrentAppWindow } from "@/platform/window";

interface CustomTitlebarProps {
  className?: string;
}

type WindowControls = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  startDragging: () => Promise<void>;
};

let cachedControls: WindowControls | null = null;

async function getWindowControls(): Promise<WindowControls> {
  if (cachedControls) return cachedControls;

  const win = await getCurrentAppWindow();

  cachedControls = {
    minimize: () => win.minimize(),
    toggleMaximize: () => win.toggleMaximize(),
    close: () => win.close(),
    startDragging: () => win.startDragging(),
  };

  return cachedControls;
}

const desktop = canUseWindowControls();

export function CustomTitlebar({
  className,
}: CustomTitlebarProps) {
  const { t } = useTranslation();

  const handleMinimize = useCallback(async () => {
    try {
      const ctrl = await getWindowControls();
      await ctrl.minimize();
    } catch (e) {
      console.error("Failed to minimize window", e);
    }
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    try {
      const ctrl = await getWindowControls();
      await ctrl.toggleMaximize();
    } catch (e) {
      console.error("Failed to toggle maximize window", e);
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      const ctrl = await getWindowControls();
      await ctrl.close();
    } catch (e) {
      console.error("Failed to close window", e);
    }
  }, []);

  const handleDragStart = useCallback(async (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!desktop || event.button !== 0) return;

    const target = event.target;
    if (target instanceof Element && target.closest("[data-no-window-drag]")) {
      return;
    }

    try {
      const ctrl = await getWindowControls();
      await ctrl.startDragging();
    } catch (e) {
      console.error("Failed to start window dragging", e);
    }
  }, []);

  return (
    <div
      data-tauri-drag-region
      onMouseDown={(event) => {
        void handleDragStart(event);
      }}
      className={cn(
        "relative flex h-10 shrink-0 items-center justify-end",
        "select-none",
        "pr-3",
        className,
      )}
    >
      <div
        data-tauri-drag-region
        className="absolute inset-0"
        aria-hidden="true"
      />

      <div
        data-no-window-drag
        className="relative z-10 flex items-center gap-0.5"
      >
        {desktop && (
          <>
            <button
              type="button"
              data-no-window-drag
              className={cn(
                "rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
                "focus:outline-none",
              )}
              onClick={handleMinimize}
              title={t("titlebar.minimize", "Minimize")}
            >
              <Minus size={14} />
            </button>

            <button
              type="button"
              data-no-window-drag
              className={cn(
                "rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
                "focus:outline-none",
              )}
              onClick={handleToggleMaximize}
              title={t("titlebar.maximize", "Maximize")}
            >
              <Maximize2 size={14} />
            </button>

            <button
              type="button"
              data-no-window-drag
              className={cn(
                "rounded-md p-1.5 text-muted-foreground hover:bg-red-500/20 hover:text-red-500 transition-colors",
                "focus:outline-none",
              )}
              onClick={handleClose}
              title={t("titlebar.close", "Close")}
            >
              <X size={14} />
            </button>
          </>
        )}

      </div>
    </div>
  );
}
