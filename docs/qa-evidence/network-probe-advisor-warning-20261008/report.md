# Desktop Dogfood Report: Bench Captive QA

| Field              | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| **Date**           | 2026-10-08                                                                  |
| **App / Version**  | Bench Captive QA 1.37.0 (isolated bundle `com.bench.app.captiveqa20261008`) |
| **OS**             | macOS 27.0.1, arm64                                                         |
| **Locale / Theme** | zh-CN and en / follow system                                                |
| **Scope**          | Network Probe navigation and Advisor empty state; no active probes          |

## Summary

| Severity  | Count |
| --------- | ----- |
| Critical  | 0     |
| High      | 0     |
| Medium    | 0     |
| Low       | 0     |
| **Total** | **0** |

## Issues

No additional GUI issue was observed in this focused smoke session. The Advice page opened and showed its localized empty state in Chinese and English.

## Verification Notes

- The original Captive `warn` omission was reproduced by the native Rust regression test before the fix; the repaired branch now emits a `warn` opinion. The same opinion’s Chinese and English copy is covered by the React component test.
- The full Health scan was deliberately not run: it pings a hostname and may use IPv6, which is outside this QA session's allowed scope. No PCAP or IPv6 probe was run.
- Screenshots: `screenshots/advisor-empty-zh.png` and `screenshots/advisor-empty-en.png`.
- The isolated QA app exited through ⌘Q. The official Bench app remained closed; the existing `bench-host` PID 1034 was preserved.
