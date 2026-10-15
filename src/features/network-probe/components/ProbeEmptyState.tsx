import type { ReactNode } from "react"

interface ProbeEmptyStateProps {
  children: ReactNode
}

export function ProbeEmptyState({ children }: ProbeEmptyStateProps) {
  return (
    <div className="bg-muted/20 text-muted-foreground flex min-h-24 items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center">
      <p className="text-sm">{children}</p>
    </div>
  )
}
