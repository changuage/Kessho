# ADR 0005: Background audio lifecycle is first class

## Status
Accepted.

## Decision
iOS and macOS app builds must coordinate Product Core lifecycle, audio-session state, interruptions, route changes, foreground/background transitions, and UI telemetry throttling so audio can continue when the app is backgrounded where the platform allows it.

## Consequences
- Runtime lifecycle operations must be serialized, awaited, and observable.
- Background transitions may preserve audio while reducing UI-frequency work.
- Device-only validation remains required for native background playback and must be documented when it cannot run locally.
