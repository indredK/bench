/**
 * Primitive UI / 基础 UI: render primitives only; 只提供基础组件.
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

interface StickyTableProps extends React.ComponentProps<"table"> {
  className?: string
  containerClassName?: string
  layout?: "auto" | "fixed"
}

function StickyTable({
  className,
  containerClassName,
  layout = "auto",
  ...props
}: StickyTableProps) {
  return (
    <ScrollableArea
      data-table-scroll
      wrapperClassName="max-h-full"
      className={cn(
        "bg-background isolate max-h-full min-h-[120px] w-full min-w-[280px]",
        containerClassName,
      )}
    >
      <table
        className={cn(
          "bg-background w-full border-separate border-spacing-0 text-sm",
          layout === "fixed" && "table-fixed",
          className,
        )}
        {...props}
      />
    </ScrollableArea>
  )
}

interface StickyTableHeaderProps extends React.ComponentProps<"thead"> {
  className?: string
}

function StickyTableHeader({ className, ...props }: StickyTableHeaderProps) {
  return <thead className={cn(className)} {...props} />
}

interface StickyTableBodyProps extends React.ComponentProps<"tbody"> {
  className?: string
}

function StickyTableBody({ className, ...props }: StickyTableBodyProps) {
  return <tbody className={cn("[&_tr:last-child>td]:border-b-0", className)} {...props} />
}

interface StickyTableRowProps extends React.ComponentProps<"tr"> {
  className?: string
}

function StickyTableRow({ className, ...props }: StickyTableRowProps) {
  return (
    <tr
      className={cn(
        "hover:bg-muted/30 data-[state=selected]:bg-accent/60 transition-colors",
        className,
      )}
      {...props}
    />
  )
}

interface StickyTableHeadProps extends React.ComponentProps<"th"> {
  className?: string
  isFirstColumn?: boolean
  isFirstRow?: boolean
}

function StickyTableHead({
  className,
  isFirstColumn = false,
  isFirstRow = false,
  ...props
}: StickyTableHeadProps) {
  const baseClasses =
    "h-10 px-3 text-left align-middle font-semibold text-muted-foreground bg-background border-b border-r border-border last:border-r-0"
  const stickyClasses = cn(
    isFirstColumn &&
      isFirstRow &&
      "sticky top-0 left-0 z-sticky-table-corner shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15),0_2px_6px_-2px_rgba(0,0,0,0.12)]",
    isFirstRow &&
      !isFirstColumn &&
      "sticky top-0 z-sticky-table-header shadow-[0_2px_6px_-2px_rgba(0,0,0,0.12)]",
    !isFirstRow &&
      isFirstColumn &&
      "sticky left-0 z-sticky-table-column-header shadow-[4px_0_8px_-4px_rgba(0,0,0,0.12)]",
  )

  return <th className={cn(baseClasses, stickyClasses, className)} {...props} />
}

interface StickyTableCellProps extends React.ComponentProps<"td"> {
  className?: string
  isFirstColumn?: boolean
}

function StickyTableCell({ className, isFirstColumn = false, ...props }: StickyTableCellProps) {
  const baseClasses =
    "p-3 align-middle bg-background border-b border-r border-border last:border-r-0"
  const stickyClasses = isFirstColumn
    ? "sticky left-0 z-sticky-table-column whitespace-nowrap font-medium shadow-[4px_0_8px_-4px_rgba(0,0,0,0.12)]"
    : ""

  return <td className={cn(baseClasses, stickyClasses, className)} {...props} />
}

interface StickyTableFooterProps extends React.ComponentProps<"tfoot"> {
  className?: string
}

function StickyTableFooter({ className, ...props }: StickyTableFooterProps) {
  return (
    <tfoot
      className={cn("bg-muted/50 border-t font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
}

interface StickyTableCaptionProps extends React.ComponentProps<"caption"> {
  className?: string
}

function StickyTableCaption({ className, ...props }: StickyTableCaptionProps) {
  return <caption className={cn("text-muted-foreground mt-4 text-sm", className)} {...props} />
}

type StickyTableSortDirection = "asc" | "desc" | "none"

interface StickyTableSortButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  direction?: StickyTableSortDirection
  align?: "left" | "center" | "right"
}

function StickyTableSortButton({
  className,
  direction = "none",
  align = "left",
  children,
  type,
  ...props
}: StickyTableSortButtonProps) {
  const alignClassName =
    align === "right"
      ? "justify-end text-right"
      : align === "center"
        ? "justify-center text-center"
        : "justify-start text-left"

  return (
    <button
      type={type ?? "button"}
      className={cn(
        "hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex w-full items-center gap-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        alignClassName,
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <span className={cn("shrink-0", direction === "none" && "opacity-40")} aria-hidden="true">
        {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "⇅"}
      </span>
    </button>
  )
}

interface StickyTableTextProps extends React.ComponentProps<"span"> {
  className?: string
  title?: string
}

function StickyTableText({
  className,
  title,
  children,
  onClick: externalOnClick,
  onMouseDown: externalOnMouseDown,
  onMouseUp: externalOnMouseUp,
  ...restProps
}: StickyTableTextProps) {
  const spanRef = useRef<HTMLSpanElement | null>(null)
  const [isTruncated, setIsTruncated] = useState(false)
  const tooltipContent = title ?? (typeof children === "string" ? children : undefined)

  const checkTruncation = useCallback(() => {
    const el = spanRef.current
    if (!el) return
    setIsTruncated(el.scrollWidth > el.clientWidth)
  }, [])

  useEffect(() => {
    checkTruncation()

    const el = spanRef.current
    if (!el) return

    const observer = new ResizeObserver(checkTruncation)
    observer.observe(el)
    return () => observer.disconnect()
  }, [checkTruncation])

  if (!tooltipContent || !isTruncated) {
    return (
      <span
        ref={spanRef}
        className={cn("block min-w-0 truncate", className)}
        onClick={externalOnClick}
        onMouseDown={externalOnMouseDown}
        onMouseUp={externalOnMouseUp}
        {...restProps}
      >
        {children}
      </span>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          ref={spanRef}
          className={cn("block min-w-0 truncate", className)}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            externalOnClick?.(e)
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
            externalOnMouseDown?.(e)
          }}
          onMouseUp={(e) => {
            e.stopPropagation()
            externalOnMouseUp?.(e)
          }}
          {...restProps}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="max-w-xs break-all whitespace-pre-wrap">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  )
}

interface StickyTableCheckboxProps extends Omit<React.ComponentProps<"input">, "type"> {
  className?: string
  indeterminate?: boolean
}

const StickyTableCheckbox = forwardRef<HTMLInputElement, StickyTableCheckboxProps>(
  ({ className, indeterminate = false, ...props }, ref) => {
    const internalRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
      if (!internalRef.current) {
        return
      }

      internalRef.current.indeterminate = indeterminate
    }, [indeterminate])

    const resolvedAriaChecked =
      props["aria-checked"] ??
      (indeterminate
        ? "mixed"
        : props.checked === undefined
          ? undefined
          : props.checked
            ? "true"
            : "false")

    return (
      <input
        ref={(node) => {
          internalRef.current = node

          if (typeof ref === "function") {
            ref(node)
            return
          }

          if (ref) {
            ref.current = node
          }
        }}
        type="checkbox"
        aria-checked={resolvedAriaChecked}
        className={cn("h-4 w-4 cursor-pointer rounded", className)}
        {...props}
      />
    )
  },
)

StickyTableCheckbox.displayName = "StickyTableCheckbox"

export {
  StickyTable,
  StickyTableHeader,
  StickyTableBody,
  StickyTableFooter,
  StickyTableRow,
  StickyTableHead,
  StickyTableCell,
  StickyTableCaption,
  StickyTableSortButton,
  StickyTableText,
  StickyTableCheckbox,
}

export type {
  StickyTableProps,
  StickyTableHeaderProps,
  StickyTableBodyProps,
  StickyTableFooterProps,
  StickyTableRowProps,
  StickyTableHeadProps,
  StickyTableCellProps,
  StickyTableCaptionProps,
  StickyTableSortDirection,
  StickyTableSortButtonProps,
  StickyTableTextProps,
  StickyTableCheckboxProps,
}
