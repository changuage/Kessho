# ADR 0002: Fail closed instead of silently falling back

## Status
Accepted.

## Decision
When Product Core cannot initialize in production, the application must enter a clearly diagnosed degraded state. It must not instantiate the reference TypeScript/Web Audio engine as a substitute.

## Consequences
- Product Core availability becomes a startup capability check.
- Missing WASM/worklet/native capability is user-visible and telemetry-visible.
- Dev/reference fallbacks require explicit non-production flags and tests.
