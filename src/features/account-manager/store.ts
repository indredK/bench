/**
 * Feature Store / 功能状态: state and simple actions only; 只存状态与简单动作.
 */
import { create } from "zustand"
import type {
  AccountManagerActions,
  AccountManagerState,
} from "@/features/account-manager/model/store-types"
import { initialAccountManagerState } from "@/features/account-manager/model/store-types"
import { pickInitialSelection } from "@/features/account-manager/model/selectors"

export type { AccountManagerState, AccountManagerActions }

export const useAccountManagerStore = create<AccountManagerState & AccountManagerActions>(
  (set) => ({
    ...initialAccountManagerState,
    setStations: (stations) =>
      set((state) => ({
        stations: typeof stations === "function" ? stations(state.stations) : stations,
      })),
    setAccounts: (accounts) =>
      set((state) => ({
        accounts: typeof accounts === "function" ? accounts(state.accounts) : accounts,
      })),
    setLoading: (loading) => set({ loading }),
    setLoadError: (loadError) => set({ loadError }),
    setSelectedStationId: (selectedStationId) => set({ selectedStationId }),
    setSelectedAccountId: (selectedAccountId) => set({ selectedAccountId }),
    setOpeningAccountId: (openingAccountId) =>
      set((state) => ({
        openingAccountId:
          typeof openingAccountId === "function"
            ? openingAccountId(state.openingAccountId)
            : openingAccountId,
      })),
    setAddStationOpen: (isAddStationOpen) => set({ isAddStationOpen }),
    setAddAccountOpen: (isAddAccountOpen) => set({ isAddAccountOpen }),
    setEditStationOpen: (isEditStationOpen) => set({ isEditStationOpen }),
    setEditingStation: (editingStation) => set({ editingStation }),
    setEditAccountOpen: (isEditAccountOpen) => set({ isEditAccountOpen }),
    setEditingAccount: (editingAccount) => set({ editingAccount }),
    setDeleteStationOpen: (isDeleteStationOpen) => set({ isDeleteStationOpen }),
    setDeletingStation: (deletingStation) => set({ deletingStation }),
    setDeleteAccountOpen: (isDeleteAccountOpen) => set({ isDeleteAccountOpen }),
    setDeletingAccount: (deletingAccount) => set({ deletingAccount }),
    setImportingData: (importingData) => set({ importingData }),
    setExportingData: (exportingData) => set({ exportingData }),
    setReorderingStations: (reorderingStations) => set({ reorderingStations }),
    setReorderingAccounts: (reorderingAccounts) => set({ reorderingAccounts }),
    setQuickLoginOpen: (isQuickLoginOpen) => set({ isQuickLoginOpen }),
    setExternalAppsOpen: (isExternalAppsOpen) => set({ isExternalAppsOpen }),
    setExternalAppsAccountId: (externalAppsAccountId) => set({ externalAppsAccountId }),
    applyInitialSelection: (stations, accounts) => {
      const { stationId, accountId } = pickInitialSelection(stations, accounts)
      set({ selectedStationId: stationId, selectedAccountId: accountId })
    },
    selectStation: (id, accounts) => {
      const first = accounts.find((account) => account.stationId === id)
      set({ selectedStationId: id, selectedAccountId: first?.id ?? "" })
    },
  }),
)
