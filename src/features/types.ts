/**
 * Feature Contract / 功能契约: define metadata only; 只定义功能元数据.
 */
import type { ReactNode } from "react";

export interface AppFeature {
  id: string;
  path: string;
  labelKey: string;
  icon: ReactNode;
  render: (feature: AppFeature) => ReactNode;
  desktopOnly?: boolean;
}

export interface NavigationItem {
  path: string;
  name: string;
  icon: ReactNode;
}
