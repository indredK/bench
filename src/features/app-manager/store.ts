import { create } from "zustand";
import type { OperationStatus } from "@/features/app-manager/model/operations";
import { createAppManagerBasicActions } from "@/features/app-manager/model/store-basic-actions";
import { createInitialAppManagerState } from "@/features/app-manager/model/store-state";
import type {
  AppFilterKey,
  AppManagerState,
} from "@/features/app-manager/model/store-types";
import { APP_FILTER_OPTIONS } from "@/features/app-manager/model/store-types";

export type { AppFilterKey, AppManagerState, OperationStatus };
export { APP_FILTER_OPTIONS };

export const useAppManagerStore = create<AppManagerState>((set) => ({
  ...createInitialAppManagerState(),
  ...createAppManagerBasicActions(set),
}));
