import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

type MenuEventHandler = (menuItemId: string) => void;

const menuHandlers: Record<string, MenuEventHandler> = {};

export function useMenuEvent(menuItemId: string, handler: MenuEventHandler) {
  useEffect(() => {
    menuHandlers[menuItemId] = handler;

    return () => {
      delete menuHandlers[menuItemId];
    };
  }, [menuItemId, handler]);
}

export function useInitMenuEvents() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        unlisten = await listen<string>("menu-event", (event) => {
          const handler = menuHandlers[event.payload];
          if (handler) {
            handler(event.payload);
          }
        });
      } catch {
        // 非 Tauri 环境（浏览器开发时）忽略
      }
    };

    setup();

    return () => {
      unlisten?.();
    };
  }, []);
}