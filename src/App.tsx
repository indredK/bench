import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Zap, Trash2, Monitor, Cpu, Box, AppWindow } from "lucide-react";
import { useTranslation } from "react-i18next";
import Sidebar from "./components/layout/Sidebar";
import PortManager from "./components/features/PortManager";
import SystemInfo from "./components/features/SystemInfo";
import DevCleaner from "./components/features/DevCleaner";
import EnvDetector from "./components/features/EnvDetector";
import AppManager from "./components/features/AppManager";
import HardwareComparePage from "./components/pages/HardwareComparePage";
import { GlobalContextMenu } from "@/features/context-menu/GlobalContextMenu";
import { useDefaultContextMenu } from "@/features/context-menu/useContextMenuRegistration";
import type { ContextMenuConfig } from "@/features/context-menu/types";
import { useMemo } from "react";

export interface SidebarItem {
  path: string;
  name: string;
  icon: React.ReactNode;
}

function App() {
  const { t } = useTranslation();

  useDefaultContextMenu(useMemo((): (() => ContextMenuConfig) => () => ({
    id: "default-menu",
    items: [
      {
        id: "refresh",
        label: t("appManager.refresh"),
        icon: undefined,
        onClick: () => window.location.reload(),
      },
    ],
  }), [t]));

  const sidebarItems: SidebarItem[] = [
    { path: "/", name: t("sidebar.portManager"), icon: <Zap size={18} /> },
    { path: "/app-manager", name: t("sidebar.appManager"), icon: <AppWindow size={18} /> },
    { path: "/dev-cleaner", name: t("sidebar.devCleaner"), icon: <Trash2 size={18} /> },
    { path: "/hardware", name: t("sidebar.hardwareQuery"), icon: <Cpu size={18} /> },
    { path: "/system-info", name: t("sidebar.systemInfo"), icon: <Monitor size={18} /> },
    { path: "/env-detector", name: t("sidebar.envDetector"), icon: <Box size={18} /> },
  ];

  return (
    <Router hook={useHashLocation}>
      <GlobalContextMenu className="flex h-screen overflow-hidden bg-background">
        <Sidebar items={sidebarItems} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden p-4">
            <Switch>
              <Route path="/" component={PortManager} />
              <Route path="/app-manager">
                <AppManager active />
              </Route>
              <Route path="/dev-cleaner" component={DevCleaner} />
              <Route path="/system-info">
                <SystemInfo active />
              </Route>
              <Route path="/hardware" component={HardwareComparePage} />
              <Route path="/env-detector">
                <EnvDetector active />
              </Route>
            </Switch>
          </div>
        </div>
      </GlobalContextMenu>
    </Router>
  );
}

export default App;
