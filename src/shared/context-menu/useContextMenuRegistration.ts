import { useEffect, useRef } from "react";
import { contextMenuManager } from "./ContextMenuManager";
import type { ContextMenuRegistration } from "./types";

/**
 * Register a context-specific right-click menu.
 *
 * The hook automatically unregisters on unmount, and re-registers
 * if the registration configuration changes.
 *
 * @example
 * ```tsx
 * useContextMenuRegistration({
 *   id: "my-table",
 *   selector: '[data-context-id]',
 *   resolveContext: (el) => el.dataset.contextId,
 *   buildMenu: (ctx) => ({
 *     id: "my-table-menu",
 *     items: [{ id: "copy", label: "Copy", onClick: () => copy(ctx) }],
 *   }),
 * });
 * ```
 */
export function useContextMenuRegistration(
  registration: ContextMenuRegistration | null
) {
  const prevRef = useRef<ContextMenuRegistration | null>(null);

  useEffect(() => {
    if (!registration) return;

    // If registration already active with same id, unregister old first
    if (prevRef.current && prevRef.current.id !== registration.id) {
      contextMenuManager.unregister(prevRef.current.id);
    }

    contextMenuManager.register(registration);
    prevRef.current = registration;

    return () => {
      contextMenuManager.unregister(registration.id);
    };
  }, [registration]);
}

/**
 * Register the default (fallback) right-click menu shown when no
 * context-specific menu matches.
 */
export function useDefaultContextMenu(
  builder: (() => import("./types").ContextMenuConfig) | null
) {
  useEffect(() => {
    if (builder) {
      contextMenuManager.setDefaultMenuBuilder(builder);
    } else {
      contextMenuManager.setDefaultMenuBuilder(() => ({
        id: "__empty__",
        items: [],
      }));
    }
    return () => {
      contextMenuManager.setDefaultMenuBuilder(null);
    };
  }, [builder]);
}