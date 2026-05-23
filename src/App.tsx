/**
 * App Shell / 应用壳层: compose routing and shell actions; 只做全局组合与路由.
 */
import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useTranslation } from "react-i18next";
import Sidebar from "./components/layout/Sidebar";
import { CustomTitlebar } from "./components/layout/CustomTitlebar";
import { GlobalContextMenu } from "@/shared/context-menu/GlobalContextMenu";
import { useDefaultContextMenu } from "@/shared/context-menu/useContextMenuRegistration";
import type { ContextMenuConfig } from "@/shared/context-menu/types";
import { useMenuEvent, useInitMenuEvents } from "@/hooks/useMenuEvents";
import { AboutDialog } from "@/components/common/AboutDialog";
import { SettingsDialog } from "@/components/common/SettingsDialog";
import { UpdateDialog } from "@/components/common/UpdateDialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { appFeatures, createNavigationItems, getFeatureByPath } from "@/features/registry";
import { requestFeatureRefresh } from "@/features/refresh";
import { useUpdaterController } from "@/features/updater/hooks/useUpdaterController";
import { markMainReady } from "@/lib/tauri/commands/bootstrap";
import { WINDOW_BOOTSTRAP_EVENTS } from "@/lib/tauri/contracts";
import { emitPlatformEventTo } from "@/platform/events";
import { canUseWindowControls } from "@/platform/window";

function App() {
  const { t } = useTranslation();
  const updater = useUpdaterController();

  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!canUseWindowControls()) return undefined;

    requestAnimationFrame(() => {
      // Mark ready in backend FIRST (#103): if the splash listener wasn't
      // attached yet, it will poll this flag immediately after subscribing
      // and reveal the main window without depending on event timing.
      void markMainReady().finally(() => {
        void emitPlatformEventTo("splashscreen", WINDOW_BOOTSTRAP_EVENTS.mainReady, null);
      });
    });

    return undefined;
  }, []);

  const handleRefresh = useCallback(async () => {
    const currentPath = window.location.hash.replace(/^#/, "") || "/";
    const currentFeature = getFeatureByPath(currentPath);
    if (currentFeature) {
      await requestFeatureRefresh(currentFeature.id);
    }
  }, []);

  const handleSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  useDefaultContextMenu(useMemo((): (() => ContextMenuConfig) => () => ({
    id: "default-menu",
    items: [
      {
        id: "refresh",
        label: t("appManager.refresh"),
        icon: undefined,
        onClick: () => {
          void handleRefresh();
        },
      },
    ],
  }), [handleRefresh, t]));

  useInitMenuEvents();

  useMenuEvent("about", () => setAboutOpen(true));
  useMenuEvent("check_updates", () => {
    void updater.checkUpdates();
  });
  useMenuEvent("preferences", () => {
    handleSettings();
  });
  useMenuEvent("reload", () => {
    void handleRefresh();
  });
  // Note: "toggle_devtools" is handled directly in Rust (src-tauri/src/menu.rs)
  // because devtools open/close is only callable from the native side (#066).

  const sidebarItems = useMemo(() => createNavigationItems(t), [t]);

  return (
    <>
      <Router hook={useHashLocation}>
        <GlobalContextMenu className="flex h-screen overflow-hidden bg-background">
          <div className="flex flex-1 flex-col overflow-hidden">
            <CustomTitlebar />

            <div className="flex flex-1 overflow-hidden">
              <Sidebar
                items={sidebarItems}
                onRefresh={handleRefresh}
                onSettings={handleSettings}
              />
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-hidden p-4">
                  <Switch>
                    {appFeatures.map((feature) => (
                      <Route key={feature.id} path={feature.path}>
                        {feature.render(feature)}
                      </Route>
                    ))}
                  </Switch>
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
