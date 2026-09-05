import { describe, expect, it } from "vitest"

import { analyzeRustSources } from "../check-rust-cfg-hygiene.mjs"

const SRC = "/virtual/src"
const ROOT = "/virtual"

function run(files) {
  return analyzeRustSources(
    Object.entries(files).map(([name, content]) => ({
      path: `${SRC}/${name}`,
      content,
    })),
    { srcDir: SRC, displayRoot: ROOT },
  )
}

describe("Rust cfg hygiene guard", () => {
  it("flags a const only referenced inside a macOS cfg block", () => {
    const { violations } = run({
      "preview.rs": `
const SIPS_TIMEOUT: u64 = 60;

fn make_proxy() -> bool {
    #[cfg(target_os = "macos")]
    {
        run(SIPS_TIMEOUT)
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}
`,
    })

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ rule: "A", name: "SIPS_TIMEOUT", kind: "const" })
    expect(violations[0].detail).toContain("windows")
  })

  it("flags an import plus its source const when both are only used on macOS", () => {
    const { violations } = run({
      "scan.rs": `pub const IMG_MAX_EDGE: u32 = 1600;`,
      "preview.rs": `
use super::scan::{fresh, IMG_MAX_EDGE};

fn make_proxy() -> u32 {
    #[cfg(target_os = "macos")]
    {
        IMG_MAX_EDGE
    }
    #[cfg(not(target_os = "macos"))]
    {
        0
    }
}
`,
    })

    const names = violations.map((v) => `${v.file}:${v.name}`).sort()
    expect(names).toEqual(["src/preview.rs:IMG_MAX_EDGE", "src/scan.rs:IMG_MAX_EDGE"])
  })

  it("flags `let mut` whose only reassignment is platform-gated", () => {
    const { violations } = run({
      "poster.rs": `
fn make_poster() -> bool {
    let mut made = false;
    #[cfg(target_os = "macos")]
    {
        made = true;
    }
    made
}
`,
    })

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ rule: "B", name: "made" })
  })

  it("accepts complementary macOS and Windows call sites", () => {
    const { violations } = run({
      "exec.rs": `
fn run_shell_output(cmd: &str) -> bool { !cmd.is_empty() }

#[cfg(target_os = "macos")]
pub fn run_shell() -> bool { run_shell_output("sh") }

#[cfg(target_os = "windows")]
pub fn run_shell() -> bool { run_shell_output("pwsh") }
`,
    })

    expect(violations).toEqual([])
  })

  it("accepts a cfg-gated module referenced only from a cfg-gated block", () => {
    const { violations } = run({
      "lib.rs": `
#[cfg(target_os = "macos")]
mod macos_webview;

fn setup() {
    #[cfg(target_os = "macos")]
    macos_webview::schedule(main_window());
}
`,
      "macos_webview.rs": `pub fn schedule() {}`,
    })

    expect(violations).toEqual([])
  })

  it("accepts a binding exempted by cfg_attr allow(unused_mut)", () => {
    const { violations } = run({
      "probe.rs": `
fn build() -> u32 {
    #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
    let mut b = 1;
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        b = 2;
    }
    b
}
`,
    })

    expect(violations).toEqual([])
  })

  it("accepts items used unconditionally", () => {
    const { violations } = run({
      "plain.rs": `
const LIMIT: usize = 10;

fn take() -> usize { LIMIT }
`,
    })

    expect(violations).toEqual([])
  })
})
