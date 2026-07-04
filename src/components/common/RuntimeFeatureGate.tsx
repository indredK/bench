/**
 * Common UI / 通用 UI: share cross-feature UI; 只放跨功能通用界面.
 */
import type { ReactNode } from "react"
import { DesktopOnly } from "@/components/common/DesktopOnly"
import { getFeatureGateReason, type FeatureDescriptor } from "@/platform/capabilities"

interface RuntimeFeatureGateProps {
  feature?: FeatureDescriptor
  title: string
  icon: ReactNode
  description?: string
  children: ReactNode
}

export function RuntimeFeatureGate({
  feature,
  title,
  icon,
  description,
  children,
}: RuntimeFeatureGateProps) {
  const gate = getFeatureGateReason(feature)
  if (gate.gated) {
    return (
      <DesktopOnly
        title={title}
        icon={icon}
        description={description}
        reason={gate.reason}
        platform={gate.platform}
      />
    )
  }

  return <>{children}</>
}
