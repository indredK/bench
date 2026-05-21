/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import type { Ref } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PortManagerControlsProps {
  t: TFunction;
  inputRef: Ref<HTMLInputElement>;
  inputValue: string;
  showInvalidToast: boolean;
  inputError: string;
  killing: boolean;
  isScanning: boolean;
  portCount: number;
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onScan: () => void;
  onClear: () => void;
  onClearAll: () => void;
}

const chipActionBase = "flex size-5 shrink-0 items-center justify-center rounded-full";

export function PortManagerControls({
  t,
  inputRef,
  inputValue,
  showInvalidToast,
  inputError,
  killing,
  isScanning,
  portCount,
  onInputChange,
  onInputKeyDown,
  onScan,
  onClear,
  onClearAll,
}: PortManagerControlsProps) {
  return (
    <div className="flex flex-wrap items-start gap-2.5">
      <div className="relative flex-1" style={{ minWidth: 200 }}>
        <Input
          ref={inputRef}
          id="port-input"
          className="pr-9"
          placeholder={t("portManager.placeholder")}
          value={inputValue}
          onChange={onInputChange}
          onKeyDown={onInputKeyDown}
          disabled={killing}
          autoComplete="off"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          <Tooltip open={showInvalidToast}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "flex size-5 items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  inputValue.length > 0
                    ? showInvalidToast
                      ? "animate-pulse bg-yellow-500 text-white hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 opacity-100"
                      : "bg-muted-foreground text-background opacity-60 hover:bg-foreground hover:opacity-100"
                    : "opacity-0 pointer-events-none"
                )}
                onClick={onClear}
                disabled={killing}
                aria-label="Clear input"
              >
                <X size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{inputError || t("portManager.invalidInput")}</TooltipContent>
          </Tooltip>
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="default"
          onClick={onScan}
          disabled={!inputValue.trim() || killing || isScanning}
          className="min-w-[120px] justify-center"
        >
          {isScanning && <Loader2 className="size-3.5 animate-spin" />}
          {t("portManager.scanButton")}
        </Button>
        <Button
          variant="secondary"
          onClick={onClearAll}
          disabled={portCount === 0 || killing}
          className="min-w-[130px]"
        >
          {t("portManager.clearSelectedPorts")}
          {portCount > 0 && <span className="ml-0.5 text-xs opacity-60">{portCount}</span>}
        </Button>
      </div>
    </div>
  );
}

export function PortManagerCommonPorts({
  ports,
  killing,
  portStates,
  onAddPort,
}: {
  ports: number[];
  killing: boolean;
  portStates: { port: number }[];
  onAddPort: (port: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ports.map((port) => (
        <Button
          key={port}
          variant="secondary"
          size="sm"
          className="rounded-lg"
          onClick={() => onAddPort(port)}
          disabled={killing || portStates.some((ps) => ps.port === port)}
        >
          {port}
        </Button>
      ))}
    </div>
  );
}

export function PortManagerPortChip({
  port,
  statusClassName,
  statusIcon,
  onScrollTo,
  onRescan,
  onRemove,
  t,
}: {
  port: number;
  statusClassName: string;
  statusIcon: React.ReactNode;
  onScrollTo: () => void;
  onRescan: () => void;
  onRemove: () => void;
  t: TFunction;
}) {
  return (
    <span
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-[13px] font-medium leading-[22px] whitespace-nowrap transition-colors animate-[chip-in_0.12s_ease-out]",
        statusClassName
      )}
      onClick={onScrollTo}
    >
      <span className="w-4 shrink-0 text-center">{statusIcon}</span>
      <span>{port}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(chipActionBase, "group transition hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
            onClick={(event) => {
              event.stopPropagation();
              onRescan();
            }}
          >
            <RefreshCw size={13} className="transition-transform group-hover:rotate-180" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("portManager.rescan")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(chipActionBase, "text-yellow-600 dark:text-yellow-400 transition hover:bg-yellow-600 hover:text-white dark:hover:bg-yellow-600 dark:hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            <X size={13} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("portManager.removePort", { port })}</TooltipContent>
      </Tooltip>
    </span>
  );
}
