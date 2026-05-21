import { Trash2 } from "lucide-react";
import DevCleaner from "@/features/dev-cleaner/page";
import { useDevCleanerStore } from "@/features/dev-cleaner/store";
import type { AppFeature } from "@/features/types";

export const devCleanerFeature: AppFeature = {
  id: "dev-cleaner",
  path: "/dev-cleaner",
  labelKey: "sidebar.devCleaner",
  icon: <Trash2 size={18} />,
  render: () => <DevCleaner />,
  refresh: () => useDevCleanerStore.getState().handleScan(),
  desktopOnly: true,
};
