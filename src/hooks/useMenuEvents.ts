import { useEffect } from "react";
import { TAURI_EVENTS } from "@/lib/tauri/contracts";
import { listenToPlatformEvent } from "@/platform/events";

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
      unlisten = await listenToPlatformEvent<string>(TAURI_EVENTS.menu.event, (event) => {
        const handler = menuHandlers[event.payload];
        if (handler) {
          handler(event.payload);
        }
      });
    };

    setup();

    return () => {
      unlisten?.();
    };
  }, []);
}
