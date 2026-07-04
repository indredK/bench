import { Loader2Icon } from "lucide-react";

export function FeatureFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
