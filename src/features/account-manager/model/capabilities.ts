import type { TFunction } from "i18next"
import type { AccountManagerCapability } from "@/lib/tauri/types/account-manager"

const REASON_KEYS: Record<string, string> = {
  TARGET_PLATFORM_VALIDATION_PENDING:
    "accountManager.capabilities.reasons.targetPlatformValidationPending",
  CREDENTIAL_STORE_INITIALIZATION_FAILED:
    "accountManager.capabilities.reasons.credentialStoreInitializationFailed",
  PLATFORM_UNSUPPORTED: "accountManager.capabilities.reasons.platformUnsupported",
  INDEXED_DB_SITE_COMPATIBILITY_LIMITED:
    "accountManager.capabilities.reasons.indexedDbSiteCompatibilityLimited",
  NETWORK_PROXY_REQUIRES_MACOS_14:
    "accountManager.capabilities.reasons.networkProxyRequiresMacos14",
  NETWORK_PROXY_UNSUPPORTED_PLATFORM:
    "accountManager.capabilities.reasons.networkProxyUnsupportedPlatform",
}

export function isCapabilityUsable(capability: AccountManagerCapability | null | undefined) {
  return capability?.status === "supported" || capability?.status === "partial"
}

export function getCapabilityReason(
  t: TFunction,
  capability: AccountManagerCapability | null | undefined,
): string {
  if (!capability) return t("accountManager.capabilities.reasons.capabilityUnavailable")
  const key = capability.reasonCode ? REASON_KEYS[capability.reasonCode] : undefined
  return key ? t(key) : t("accountManager.capabilities.reasons.capabilityUnavailable")
}
