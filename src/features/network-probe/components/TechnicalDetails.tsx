/**
 * Collapsible diagnostics for network-probe result panels.
 */
interface TechnicalDetailsProps {
  title: string
  items: Array<{ label: string; value?: string }>
}

export function TechnicalDetails({ title, items }: TechnicalDetailsProps) {
  const visibleItems = items.filter((item) => item.value?.trim())
  if (visibleItems.length === 0) return null

  return (
    <details className="text-muted-foreground rounded-lg border px-3 py-2 text-xs">
      <summary className="w-fit cursor-pointer select-none">{title}</summary>
      <dl className="mt-2 space-y-2">
        {visibleItems.map((item) => (
          <div key={item.label} className="space-y-0.5 break-words">
            <dt className="font-medium">{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
