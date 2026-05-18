import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Zap, Trash2, Monitor, Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";
import Sidebar from "./components/Sidebar";
import PortManager from "./components/PortManager";
import SystemInfo from "./components/SystemInfo";
import DevCleaner from "./components/DevCleaner";
import HardwareComparePage from "./components/HardwareComparePage";

export interface SidebarItem {
  path: string;
  name: string;
  icon: React.ReactNode;
}

function App() {
  const { t } = useTranslation();

  const sidebarItems: SidebarItem[] = [
    { path: "/", name: t("sidebar.portManager"), icon: <Zap size={18} /> },
    { path: "/dev-cleaner", name: t("sidebar.devCleaner"), icon: <Trash2 size={18} /> },
    { path: "/system-info", name: t("sidebar.systemInfo"), icon: <Monitor size={18} /> },
    { path: "/hardware", name: t("sidebar.hardwareCompare"), icon: <Cpu size={18} /> },
  ];

  return (
    <Router hook={useHashLocation}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar items={sidebarItems} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden p-4">
            <Switch>
              <Route path="/" component={PortManager} />
              <Route path="/dev-cleaner" component={DevCleaner} />
              <Route path="/system-info">
                <SystemInfo active />
              </Route>
              <Route path="/hardware" component={HardwareComparePage} />
            </Switch>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
