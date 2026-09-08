/**
 * Feature Refresh / 功能刷新: route shell refresh requests; 只转发刷新请求.
 */
type FeatureRefreshHandler = () => void | Promise<void>

const refreshHandlers = new Map<string, FeatureRefreshHandler>()

export function registerFeatureRefresh(featureId: string, handler: FeatureRefreshHandler) {
  refreshHandlers.set(featureId, handler)

  return () => {
    if (refreshHandlers.get(featureId) === handler) {
      refreshHandlers.delete(featureId)
    }
  }
}

export async function requestFeatureRefresh(featureId: string) {
  await refreshHandlers.get(featureId)?.()
}
