// Node runtime contract for the host scripts (bootstrap / maintenance).
//
// `engines` is not enforced for a bare `node scripts/...` invocation, so the
// user-facing entry points check it themselves and fail with a stable code
// instead of a confusing module error from a newer runtime feature.
//
// Keep the constants aligned with package.json `engines.node`, `.node-version`
// and the CI matrix; scripts/quality/__tests__/node-contract.test.mjs asserts it.
export const MIN_NODE = { major: 24, minor: 15, patch: 0 }
export const MIN_NODE_SPEC = ">=24.15.0"
export const TARGET_NODE = "26.8.2"
export const NODE_UNSUPPORTED = "NODE_VERSION_UNSUPPORTED"

export function parseNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? ""))
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function compareNodeVersion(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

export function isSupportedNode(version, min = MIN_NODE) {
  const parsed = parseNodeVersion(version)
  if (!parsed) {
    const error = new Error(
      `${NODE_UNSUPPORTED}: cannot parse runtime version ${JSON.stringify(version)}`,
    )
    error.code = NODE_UNSUPPORTED
    throw error
  }
  return compareNodeVersion(parsed, min) >= 0
}

/** Throw a stable, actionable error when `version` is below `min`. */
export function assertSupportedNode(version = process.versions.node, min = MIN_NODE) {
  if (isSupportedNode(version, min)) return parseNodeVersion(version)
  const error = new Error(`${NODE_UNSUPPORTED}: require ${MIN_NODE_SPEC}; got ${version}`)
  error.code = NODE_UNSUPPORTED
  error.current = version
  error.required = MIN_NODE_SPEC
  error.hint = `Install or switch to Node ${TARGET_NODE} (see .node-version), or use any Node ${MIN_NODE_SPEC}.`
  throw error
}
