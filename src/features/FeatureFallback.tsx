import { Loader2Icon } from "lucide-react"

export function FeatureFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2Icon className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  )
}
