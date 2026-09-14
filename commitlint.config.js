/**
 * Commit message linting — replaces `scripts/quality/commit-msg-check.mjs`.
 *
 * Uses the industry-standard @commitlint toolchain (conventional-commits).
 * Bench's only deviation from the stock parser: commit body lines may be up
 * to 500 characters (the stock limit is 100). The "blank line between the
 * header and an optional body" rule maps to the built-in `body-leading-blank`,
 * so it is NOT reinvented here.
 *
 * `defaultIgnores` keeps commitlint from blocking merge/revert/fixup!/squash!
 * commits, matching the previous skip list in commit-msg-check.mjs.
 *
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  defaultIgnores: true,
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Built-in rule: require a blank line before the body (header/body separator).
    "body-leading-blank": [2, "always"],
    // Bench-only deviation: allow long body lines (docs/desc occasionally need it).
    "body-max-line-length": [2, "always", 500],
  },
}
