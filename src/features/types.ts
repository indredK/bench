import type { ReactNode } from "react";

export interface AppFeature {
  id: string;
  path: string;
  labelKey: string;
  icon: ReactNode;
  render: (feature: AppFeature) => ReactNode;
  refresh?: () => void | Promise<void>;
  desktopOnly?: boolean;
}

export interface NavigationItem {
  path: string;
  name: string;
  icon: ReactNode;
}
