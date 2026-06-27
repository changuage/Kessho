# ADR 0003: Mobile defaults are performance safe

## Status
Accepted.

## Decision
Mobile and constrained devices default to conservative runtime UI work. Visualizers, CPU overlays, bridge inspectors, debug diagnostics, and high-rate telemetry must be hidden, lazy, throttled, or explicitly enabled by the user.

## Consequences
- Production diagnostics publish compact counters rather than high-rate React state.
- Visual telemetry must stop or throttle when hidden, backgrounded, or disabled.
- New debug surfaces must be policy-gated and must not become part of default mobile startup.
