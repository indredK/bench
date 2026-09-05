#!/usr/bin/env bash
# cargo `rustc-wrapper` that prefers sccache when available and falls back
# to direct rustc otherwise. Lets `src-tauri/.cargo/config.toml` commit a
# single wrapper setting that works on:
#   - dev machines with sccache on PATH (Apple Silicon / Intel Homebrew,
#     Linux distros, etc.) — invoke sccache as a compiler cache;
#   - CI runners without sccache (e.g. GitHub Actions macos-latest) — pass
#     straight through to rustc so commands like `cargo metadata` and
#     `cargo deny check` don't break.
#
# cargo invokes the wrapper as:
#   <wrapper> <rustc-path> <rustc args...>
# (rustc path is always the first arg, even if the wrapper is not
# sccache — see cargo's config docs).
#
# Used by src-tauri/.cargo/config.toml. See docs/DECISIONS.md D-021.

set -e

# cargo passes the resolved rustc binary as $1. Only route through sccache
# when that binary is actually executable: GitHub Actions macos-latest (arm64)
# runners ship sccache, but the toolchain path cargo resolves there can be
# stale/missing, which made `cargo metadata` (e.g. under `cargo deny check`)
# fail with "could not execute process `...rustc -vV` (never executed)".
# CI jobs additionally set `RUSTC_WRAPPER=""`; this guard is the fallback for
# any other environment that has sccache on PATH but an unusable compiler.
if command -v sccache >/dev/null 2>&1 && [ -x "$1" ]; then
    exec sccache "$@"
fi

# Fallback: no sccache on PATH (or compiler path not usable). Pass through to
# the rustc binary cargo pointed us at (or whatever cargo passed as $1).
exec "$@"
