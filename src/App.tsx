/**
 * App Shell / 应用壳层: compose routing and shell actions.
 *
 * v3: App 偏好 (SettingsDialog) 与系统设置 (SystemSettings page) 分离。
 */
import { Router, Route, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import Sidebar from "./components/layout/Sidebar";
import { CustomTitlebar } from "./components/layout/CustomTitlebar";
import { GlobalContextMenu } from "@/shared/context-menu/GlobalContextMenu";
import { useDefaultContextMenu } from "@/shared/context-menu/useContextMenuRegistration";
import type { ContextMenuConfig } from "@/shared/context-menu/types";
import { useMenuEvent, useInitMenuEvents } from "@/hooks/useMenuEvents";
import { AboutDialog } from "@/components/common/AboutDialog";
import { SettingsDialog } from "@/components/common/SettingsDialog";
import { StartupIssuesAlert } from "@/components/common/StartupIssuesAlert";
import { UpdateDialog } from "@/components/common/UpdateDialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { appFeatures, createNavigationItems, createConfigItems } from "@/features/registry";
import { requestFeatureRefresh } from "@/features/refresh";
import { useUpdaterController } from "@/features/updater/hooks/useUpdaterController";
import { listStartupIssues, markMainReady } from "@/lib/tauri/commands/bootstrap";
import { restartApp, setTrayLabels } from "@/lib/tauri/commands";
import { WINDOW_BOOTSTRAP_EVENTS } from "@/lib/tauri/contracts";
import { emitPlatformEventTo } from "@/platform/events";
import { canUseTauriCommands } from "@/platform/capabilities";
import { canUseWindowControls } from "@/platform/window";
import { useWindowTheme } from "@/hooks/useWindowTheme";
import type { StartupIssue } from "@/lib/tauri/types/bootstrap";

function AnimatedRoutes() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    if ((location === "" || location === "/") && appFeatures.length > 0) {
      navigate(appFeatures[0].path, { replace: true });
    }
  }, [location, navigate]);
  if (location === "" || location === "/") return null;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <FeaturePanel key={location} location={location} />
    </AnimatePresence>
  );
}

function FeaturePanel({ location }: { location: string }) {
  const [frozenLocation] = useState(location);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="h-full"
    >
      <Switch location={frozenLocation}>
        {appFeatures.map((feature) => (
          <Route key={feature.id} path={feature.path}>
            {feature.render(feature)}
          </Route>
        ))}
      </Switch>
    </motion.div>
  );
}

function App() {
  const { t } = useTranslation();
  const updater = useUpdaterController();
  useWindowTheme();

  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startupIssues, setStartupIssues] = useState<StartupIssue[]>([]);

  useEffect(() => {
    if (!canUseWindowControls()) return undefined;
    requestAnimationFrame(() => {
      void markMainReady().finally(() => {
        void emitPlatformEventTo("splashscreen", WINDOW_BOOTSTRAP_EVENTS.mainReady, null);
      });
    });
    return undefined;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listStartupIssues().then((issues) => {
      if (!cancelled) setStartupIssues(issues);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void setTrayLabels({
      show: t("tray.show"),
      sleep: t("tray.preventSleep"),
      autostart: t("tray.launchAtLogin"),
      quit: t("tray.quit"),
    });
  }, [t]);

  const handleRefresh = useCallback(async () => {
    const currentPath = window.location.hash.replace(/^#/, "") || "/";
    const currentFeature = appFeatures.find((f) => f.path === currentPath);
    if (currentFeature) {
      await requestFeatureRefresh(currentFeature.id);
    }
  }, []);

  const handleRestart = useCallback(async () => {
    if (canUseTauriCommands()) { await restartApp(); return; }
    window.location.reload();
  }, []);

  const handleOpenPrefs = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  useDefaultContextMenu(useMemo((): (() => ContextMenuConfig) => () => ({
    id: "default-menu",
    items: [
      { id: "refresh", label: t("appManager.refresh"), icon: undefined, onClick: () => { void handleRefresh(); } },
    ],
  }), [handleRefresh, t]));

  useInitMenuEvents();

  useMenuEvent("about", () => setAboutOpen(true));
  useMenuEvent("check_updates", () => { void updater.checkUpdates(); });
  useMenuEvent("preferences", () => {
    setSettingsOpen(true);
  });
  useMenuEvent("reload", () => { void handleRefresh(); });

  const sidebarItems = useMemo(() => {
    const allItems = createNavigationItems(t);
    return allItems.filter((item) => item.path !== "/system-settings");
  }, [t]);

  const configItems = useMemo(() => createConfigItems(t), [t]);

  return (
    <>
      <Router hook={useHashLocation}>
        <GlobalContextMenu className="app-root flex h-screen overflow-hidden bg-background">
          <div className="flex flex-1 flex-col overflow-hidden">
            <CustomTitlebar />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar
                items={sidebarItems}
                configItems={configItems}
                onRestart={handleRestart}
                onPrefs={handleOpenPrefs}
              />
              <div className="flex flex-1 flex-col overflow-hidden bg-background">
                <div className="flex-1 overflow-hidden p-4">
                  <StartupIssuesAlert issues={startupIssues} />
                  <AnimatedRoutes />
                </div>
              </div>
            </div>
          </div>
        </GlobalContextMenu>
      </Router>

      <AboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        appVersion={updater.currentVersion || "-"}
        onCheckUpdates={() => void updater.checkUpdates()}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <UpdateDialog {...updater} />
    </>
  );
}

export default App;
