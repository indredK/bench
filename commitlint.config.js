// Vendored by bench-quality-cli (feature: commitlint).
// Edit freely — this copy lives in your repo, not in bench-quality-cli.
//
// Uses the industry-standard @commitlint toolchain (conventional-commits).
// Bench's only deviations from the stock parser:
//  - defaultIgnores keeps commitlint from blocking merge/revert/fixup!/squash! commits.
//  - commit body lines may be up to 500 characters (the stock limit is 100).
//  - the "blank line between header and body" rule maps to the built-in
//    `body-leading-blank`, so it is NOT reinvented here.
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
