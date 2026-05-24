import { ReceiptText } from "lucide-react";
import ApiBillingPage from "@/features/api-billing/page";
import type { AppFeature } from "@/features/types";

export const apiBillingFeature: AppFeature = {
  id: "api-billing",
  path: "/api-billing",
  labelKey: "sidebar.apiBilling",
  icon: <ReceiptText size={18} />,
  render: () => <ApiBillingPage />,
  desktopOnly: true,
};
