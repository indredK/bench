import { forwardRef, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface StickyTableProps extends React.ComponentProps<"table"> {
  className?: string;
  containerClassName?: string;
  layout?: "auto" | "fixed";
}

function StickyTable({
  className,
  containerClassName,
  layout = "auto",
  ...props
}: StickyTableProps) {
  return (
    <div className={cn("relative w-full overflow-auto bg-background", containerClassName)}>
      <table
        className={cn(
          "w-full border-separate border-spacing-0 text-sm bg-background",
          layout === "fixed" && "table-fixed",
          className
        )}
        {...props}
      />
    </div>
  );
}

interface StickyTableHeaderProps extends React.ComponentProps<"thead"> {
  className?: string;
}

function StickyTableHeader({ className, ...props }: StickyTableHeaderProps) {
  return <thead className={cn(className)} {...props} />;
}

interface StickyTableBodyProps extends React.ComponentProps<"tbody"> {
  className?: string;
}

function StickyTableBody({ className, ...props }: StickyTableBodyProps) {
  return <tbody className={cn("[&_tr:last-child>td]:border-b-0", className)} {...props} />;
}

interface StickyTableRowProps extends React.ComponentProps<"tr"> {
  className?: string;
}

function StickyTableRow({ className, ...props }: StickyTableRowProps) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-muted/30 data-[state=selected]:bg-accent/60",
        className
      )}
      {...props}
    />
  );
}

interface StickyTableHeadProps extends React.ComponentProps<"th"> {
  className?: string;
  isFirstColumn?: boolean;
  isFirstRow?: boolean;
}

function StickyTableHead({ className, isFirstColumn = false, isFirstRow = false, ...props }: StickyTableHeadProps) {
  const baseClasses = "h-10 px-3 text-left align-middle font-semibold text-muted-foreground bg-background border-b border-r border-border last:border-r-0";
  const stickyClasses = cn(
    isFirstColumn && isFirstRow && "sticky top-0 left-0 z-[60] shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15),0_2px_6px_-2px_rgba(0,0,0,0.12)]",
    isFirstRow && !isFirstColumn && "sticky top-0 z-[50] shadow-[0_2px_6px_-2px_rgba(0,0,0,0.12)]",
    !isFirstRow && isFirstColumn && "sticky left-0 z-[40] shadow-[4px_0_8px_-4px_rgba(0,0,0,0.12)]"
  );

  return (
    <th
      className={cn(baseClasses, stickyClasses, className)}
      {...props}
    />
  );
}

interface StickyTableCellProps extends React.ComponentProps<"td"> {
  className?: string;
  isFirstColumn?: boolean;
}

function StickyTableCell({ className, isFirstColumn = false, ...props }: StickyTableCellProps) {
  const baseClasses = "p-3 align-middle bg-background border-b border-r border-border last:border-r-0";
  const stickyClasses = isFirstColumn
    ? "sticky left-0 z-[30] whitespace-nowrap font-medium shadow-[4px_0_8px_-4px_rgba(0,0,0,0.12)]"
    : "";

  return (
    <td
      className={cn(baseClasses, stickyClasses, className)}
      {...props}
    />
  );
}

interface StickyTableFooterProps extends React.ComponentProps<"tfoot"> {
  className?: string;
}

function StickyTableFooter({ className, ...props }: StickyTableFooterProps) {
  return (
    <tfoot
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

interface StickyTableCaptionProps extends React.ComponentProps<"caption"> {
  className?: string;
}

function StickyTableCaption({ className, ...props }: StickyTableCaptionProps) {
  return (
    <caption
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

type StickyTableSortDirection = "asc" | "desc" | "none";

interface StickyTableSortButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  direction?: StickyTableSortDirection;
  align?: "left" | "center" | "right";
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
        : "justify-start text-left";

  return (
    <button
      type={type ?? "button"}
      className={cn(
        "flex w-full items-center gap-1 text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        alignClassName,
        className
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <span className={cn("shrink-0", direction === "none" && "opacity-40")} aria-hidden="true">
        {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "⇅"}
      </span>
    </button>
  );
}

interface StickyTableTextProps extends React.ComponentProps<"span"> {
  className?: string;
  title?: string;
}

function StickyTableText({ className, title, children, ...props }: StickyTableTextProps) {
  const fallbackTitle = typeof children === "string" ? children : undefined;

  return (
    <span
      className={cn("block min-w-0 truncate", className)}
      title={title ?? fallbackTitle}
      {...props}
    >
      {children}
    </span>
  );
}

interface StickyTableCheckboxProps extends Omit<React.ComponentProps<"input">, "type"> {
  className?: string;
  indeterminate?: boolean;
}

const StickyTableCheckbox = forwardRef<HTMLInputElement, StickyTableCheckboxProps>(
  ({ className, indeterminate = false, ...props }, ref) => {
    const internalRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (!internalRef.current) {
        return;
      }

      internalRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    const resolvedAriaChecked =
      props["aria-checked"] ?? (indeterminate ? "mixed" : props.checked === undefined ? undefined : (props.checked ? "true" : "false"));

    return (
      <input
        ref={(node) => {
          internalRef.current = node;

          if (typeof ref === "function") {
            ref(node);
            return;
          }

          if (ref) {
            ref.current = node;
          }
        }}
        type="checkbox"
        aria-checked={resolvedAriaChecked}
        className={cn("h-4 w-4 cursor-pointer rounded", className)}
        {...props}
      />
    );
  }
);

StickyTableCheckbox.displayName = "StickyTableCheckbox";

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
};

export type {
  StickyTableProps,
  StickyTableHeaderProps,
  StickyTableBodyProps,
  StickyTableFooterProps,
  StickyTableRowProps,
  StickyTableHeadProps,
  StickyTableCellProps,
  StickyTableCaptionProps,
  StickyTableSortButtonProps,
  StickyTableTextProps,
  StickyTableCheckboxProps,
};
