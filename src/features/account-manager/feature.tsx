import { Users } from "lucide-react";
import AccountManagerPage from "@/features/account-manager/page";
import type { AppFeature } from "@/features/types";

export const accountManagerFeature: AppFeature = {
  id: "account-manager",
  path: "/account-manager",
  labelKey: "sidebar.accountManager",
  icon: <Users size={18} />,
  render: () => <AccountManagerPage />,
  desktopOnly: true,
};
