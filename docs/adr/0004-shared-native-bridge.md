# ADR 0004: Share native bridge policy across macOS and iOS

## Status
Accepted.

## Decision
macOS and iOS native bridge validation, payload limits, lifecycle coordination, event batching, and debug gating should live in shared Swift bridge/lifecycle code unless platform APIs require a platform-specific adapter.

## Consequences
- Native bridge behavior should converge instead of drifting between platform shells.
- WebKit inspection, smoke harnesses, and verbose bridge diagnostics must be debug-only.
- Real-time audio and high-rate input must avoid JSON bridge loops once direct Product Core paths exist.
