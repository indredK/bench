/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export class AppManagerErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppManager] Render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <AlertCircle size={40} className="text-red-500" />
          <p className="font-semibold">App Manager crashed</p>
          <pre className="text-xs max-w-lg overflow-auto bg-muted p-2 rounded">
            {this.state.error}
          </pre>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: "" })}
          >
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
