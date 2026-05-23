/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import i18n from "@/i18n/config";

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
      // Class components can't use useTranslation; call i18next directly so the
      // crash fallback stays localized for the user who is most stressed (#084).
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <AlertCircle size={40} className="text-red-500" />
          <p className="font-semibold">{i18n.t("appManager.crashed")}</p>
          <pre className="text-xs max-w-lg overflow-auto bg-muted p-2 rounded">
            {this.state.error}
          </pre>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: "" })}
          >
            {i18n.t("appManager.crashedRetry")}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
