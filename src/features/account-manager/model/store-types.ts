import type { RelayStation, StationAccount } from "@/lib/tauri/types/account-manager"

export type AccountManagerState = {
  stations: RelayStation[]
  accounts: StationAccount[]
  loading: boolean
  loadError: string | null
  selectedStationId: string
  selectedAccountId: string
  openingAccountId: string | null
  isAddStationOpen: boolean
  isAddAccountOpen: boolean
  isEditStationOpen: boolean
  editingStation: RelayStation | null
  isEditAccountOpen: boolean
  editingAccount: StationAccount | null
  isDeleteStationOpen: boolean
  deletingStation: RelayStation | null
  isDeleteAccountOpen: boolean
  deletingAccount: StationAccount | null
  importingData: boolean
  exportingData: boolean
  reorderingStations: boolean
  reorderingAccounts: boolean
  isQuickLoginOpen: boolean
  isExternalAppsOpen: boolean
  externalAppsAccountId: string | null
}

export type AccountManagerActions = {
  setStations: (stations: RelayStation[] | ((prev: RelayStation[]) => RelayStation[])) => void
  setAccounts: (accounts: StationAccount[] | ((prev: StationAccount[]) => StationAccount[])) => void
  setLoading: (loading: boolean) => void
  setLoadError: (error: string | null) => void
  setSelectedStationId: (id: string) => void
  setSelectedAccountId: (id: string) => void
  setOpeningAccountId: (id: string | null | ((current: string | null) => string | null)) => void
  setAddStationOpen: (open: boolean) => void
  setAddAccountOpen: (open: boolean) => void
  setEditStationOpen: (open: boolean) => void
  setEditingStation: (station: RelayStation | null) => void
  setEditAccountOpen: (open: boolean) => void
  setEditingAccount: (account: StationAccount | null) => void
  setDeleteStationOpen: (open: boolean) => void
  setDeletingStation: (station: RelayStation | null) => void
  setDeleteAccountOpen: (open: boolean) => void
  setDeletingAccount: (account: StationAccount | null) => void
  setImportingData: (importing: boolean) => void
  setExportingData: (exporting: boolean) => void
  setReorderingStations: (reordering: boolean) => void
  setReorderingAccounts: (reordering: boolean) => void
  setQuickLoginOpen: (open: boolean) => void
  setExternalAppsOpen: (open: boolean) => void
  setExternalAppsAccountId: (id: string | null) => void
  applyInitialSelection: (stations: RelayStation[], accounts: StationAccount[]) => void
  selectStation: (id: string, accounts: StationAccount[]) => void
}

export const initialAccountManagerState: AccountManagerState = {
  stations: [],
  accounts: [],
  loading: true,
  loadError: null,
  selectedStationId: "",
  selectedAccountId: "",
  openingAccountId: null,
  isAddStationOpen: false,
  isAddAccountOpen: false,
  isEditStationOpen: false,
  editingStation: null,
  isEditAccountOpen: false,
  editingAccount: null,
  isDeleteStationOpen: false,
  deletingStation: null,
  isDeleteAccountOpen: false,
  deletingAccount: null,
  importingData: false,
  exportingData: false,
  reorderingStations: false,
  reorderingAccounts: false,
  isQuickLoginOpen: false,
  isExternalAppsOpen: false,
  externalAppsAccountId: null,
}
