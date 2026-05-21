/**
 * Shared Interaction / 共享交互: own generic menus; 只负责通用右键菜单能力.
 */
import type {
  ContextMenuRegistration,
  ContextMenuState,
  ContextMenuConfig,
} from "./types";

type ResolveContextFn = (target: HTMLElement) => unknown;
type BuildMenuFn = (ctx: unknown) => ContextMenuConfig | null;

interface InternalRegistration {
  id: string;
  selector: string;
  resolveContext: ResolveContextFn;
  buildMenu: BuildMenuFn;
}

class ContextMenuManagerImpl {
  private registrations: InternalRegistration[] = [];
  private defaultMenuBuilder: (() => ContextMenuConfig) | null = null;
  private listeners: Set<(state: ContextMenuState) => void> = new Set();

  /** Register a default menu builder (shown when no special context matches). */
  setDefaultMenuBuilder(builder: (() => ContextMenuConfig) | null) {
    this.defaultMenuBuilder = builder;
  }

  /** Register a context-specific menu. */
  register(registration: ContextMenuRegistration) {
    this.registrations.push({
      id: registration.id,
      selector: registration.selector,
      resolveContext: registration.resolveContext,
      buildMenu: registration.buildMenu,
    });
  }

  /** Unregister by id. */
  unregister(id: string) {
    this.registrations = this.registrations.filter((r) => r.id !== id);
  }

  /**
   * Walk up the DOM tree from target to find a matching registration.
   * Uses closest() semantics — stops at the first match (most specific).
   */
  private findMatch(target: HTMLElement): {
    registration: InternalRegistration;
    matchedElement: HTMLElement;
  } | null {
    // Walk up from the deepest element towards the root
    let current: HTMLElement | null = target;
    while (current) {
      for (const reg of this.registrations) {
        try {
          if (current.matches(reg.selector)) {
            return { registration: reg, matchedElement: current };
          }
        } catch {
          // invalid selector — skip
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Handle a right-click event. Resolves the matching registration,
   * builds the menu, computes position, and notifies listeners.
   */
  handleContextMenu(e: MouseEvent): ContextMenuState {
    const target = e.target as HTMLElement;
    const match = this.findMatch(target);

    let menu: ContextMenuConfig;
    let matchedId: string | null = null;
    let context: unknown = null;

    if (match) {
      context = match.registration.resolveContext(match.matchedElement);
      const built = match.registration.buildMenu(context);
      if (built) {
        menu = built;
        matchedId = match.registration.id;
      } else if (this.defaultMenuBuilder) {
        menu = this.defaultMenuBuilder();
      } else {
        menu = { id: "__empty__", items: [] };
      }
    } else if (this.defaultMenuBuilder) {
      menu = this.defaultMenuBuilder();
    } else {
      menu = { id: "__empty__", items: [] };
    }

    const state: ContextMenuState = {
      x: e.clientX,
      y: e.clientY,
      open: true,
      matchedId,
      context,
      menu,
    };

    this.listeners.forEach((fn) => fn(state));
    return state;
  }

  /** Close the current menu. */
  close() {
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      open: false,
      matchedId: null,
      context: null,
      menu: { id: "__empty__", items: [] },
    };
    this.listeners.forEach((fn) => fn(state));
  }

  subscribe(fn: (state: ContextMenuState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Clear all registrations (useful on unmount). */
  reset() {
    this.registrations = [];
    this.defaultMenuBuilder = null;
    this.listeners.clear();
  }
}

/** Singleton instance of the context menu manager. */
export const contextMenuManager = new ContextMenuManagerImpl();