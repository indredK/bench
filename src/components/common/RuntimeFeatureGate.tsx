/**
 * Common UI / 通用 UI: share cross-feature UI; 只放跨功能通用界面.
 */
import type { ReactNode } from "react";
import { DesktopOnly } from "@/components/common/DesktopOnly";
import { canUseFeature } from "@/platform/capabilities";

interface RuntimeFeatureGateProps {
  feature?: { desktopOnly?: boolean };
  title: string;
  icon: ReactNode;
  children: ReactNode;
}

export function RuntimeFeatureGate({
  feature,
  title,
  icon,
  children,
}: RuntimeFeatureGateProps) {
  if (!canUseFeature(feature)) {
    return <DesktopOnly title={title} icon={icon} />;
  }

  return <>{children}</>;
}
