import { BookText } from "lucide-react";
import TerminologyPage from "@/features/terminology/page";
import type { AppFeature } from "@/features/types";

export const terminologyFeature: AppFeature = {
  id: "terminology",
  path: "/terminology",
  labelKey: "sidebar.terminology",
  icon: <BookText size={18} />,
  render: () => <TerminologyPage />,
};
