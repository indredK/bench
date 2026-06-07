import { Coins } from "lucide-react";
import TokenCalculatorPage from "@/features/token-calculator/page";
import type { AppFeature } from "@/features/types";

export const tokenCalculatorFeature: AppFeature = {
  id: "token-calculator",
  path: "/token-calculator",
  labelKey: "sidebar.tokenCalculator",
  icon: <Coins size={18} />,
  render: () => <TokenCalculatorPage />,
};
