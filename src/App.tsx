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
import { useCallback, useMemo, useState } from "react";
import { appFeatures, createNavigationItems, getFeatureByPath } from "@/features/registry";
import { requestFeatureRefresh } from "@/features/refresh";

function App() {
  const { t } = useTranslation();

  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    // TODO: 对接更新检查逻辑
  });
  useMenuEvent("preferences", () => {
    handleSettings();
  });
  useMenuEvent("reload", () => {
    void handleRefresh();
  });
  useMenuEvent("toggle_devtools", () => {
    // DevTools 已在开发模式下通过右键菜单可用
  });

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
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </>
  );
}

export default App;
