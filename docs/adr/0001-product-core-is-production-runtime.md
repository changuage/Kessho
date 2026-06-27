# ADR 0001: Product Core is the only production runtime

## Status
Accepted.

## Decision
Production Kessho audio, sequencing, source rendering, FX routing, and CPU-critical runtime behavior must execute through Product Core behind ProductEnginePort/ProductEnginePorts. The legacy TypeScript/Web Audio implementation is reference-only and may be launched only through explicit development or A/B harness flags.

## Consequences
- Production startup fails closed if Product Core is unavailable.
- No silent fallback to web-ts is allowed.
- UI code must depend on narrow product ports, not raw Web Audio objects.
- Compatibility methods in WebProductEngine are temporary and must have removal tickets/tests.
