import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import i18n from "@/i18n/config"
import { getErrorMessage } from "@/lib/tauri/errors"
import { FeatureLoadError } from "@/components/common/FeatureLoadError"

interface FeatureErrorBoundaryProps {
  children: ReactNode
  titleKey?: string
  feature?: string
}

interface FeatureErrorBoundaryState {
  hasError: boolean
  error: string
}

export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  state = { hasError: false, error: "" }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: getErrorMessage(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[FeatureErrorBoundary] Render error:", error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: "" })
  }

  render() {
    if (this.state.hasError) {
      const { titleKey, feature } = this.props
      const title = titleKey
        ? i18n.t(titleKey)
        : feature
          ? i18n.t("common.featureLoadFailed", { feature })
          : i18n.t("common.loadFailed")

      return (
        <div className="flex h-full w-full items-center justify-center p-4">
          <FeatureLoadError
            title={title}
            description={this.state.error}
            icon={<AlertTriangle size={32} className="opacity-50" />}
            onRetry={this.handleRetry}
          />
        </div>
      )
    }

    return this.props.children
  }
}
