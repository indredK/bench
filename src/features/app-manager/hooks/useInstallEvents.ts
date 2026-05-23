/**
 * Feature Hook / 功能钩子: keep imperative wiring only; 只做命令式接线.
 *
 * Subscribes to the two install events emitted by the Rust orchestrator
 * (`app-update-install:progress` and `app-update-install:finished`) and pipes
 * each payload into the app-manager store. Mount this once near the top of the
 * Software Update view so dialogs across the tree see the same snapshot.
 */
import { useEffect } from "react";
import { TAURI_EVENTS } from "@/lib/tauri/contracts";
import { canUseTauriEvents } from "@/platform/capabilities";
import { listenToPlatformEvent } from "@/platform/events";
import { useAppManagerStore } from "@/features/app-manager/store";
import type {
  InstallFinishedEvent,
  InstallProgressEvent,
} from "@/lib/tauri/types/app-manager";

export function useInstallEvents(): void {
  useEffect(() => {
    if (!canUseTauriEvents()) return;

    // Async listeners may resolve after the effect has been torn down — use a
    // `cancelled` flag so a late unlisten still fires immediately. Same pattern
    // as `useUpdaterController` (#104).
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    const remember = (fn: () => void) => {
      if (cancelled) fn();
      else unsubs.push(fn);
    };

    void listenToPlatformEvent<InstallProgressEvent>(
      TAURI_EVENTS.appUpdateInstall.progress,
      (event) => {
        const { appId, elapsedMs: _elapsed, ...phase } = event.payload;
        // `phase` is a discriminated union — pass through verbatim so dialogs
        // can pattern-match on `.phase` without any reshaping here.
        useAppManagerStore.getState().setInstallProgress(appId, phase);
      },
    ).then(remember);

    void listenToPlatformEvent<InstallFinishedEvent>(
      TAURI_EVENTS.appUpdateInstall.finished,
      (event) => {
        useAppManagerStore.getState().setInstallFinished(event.payload.appId, event.payload);
      },
    ).then(remember);

    return () => {
      cancelled = true;
      while (unsubs.length > 0) unsubs.pop()?.();
    };
  }, []);
}
