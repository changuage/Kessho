# Kessho Product Core Control Classification

This file classifies the `core-product` host control surface by Product Core update path. Full snapshot reloads are structural fallbacks only; they must run on the host thread, never in the audio render callback.

## Live Product Core Events

- Transport start, stop, resume, and suspend post generated transport events.
- Manual melodic notes, manual drum triggers, and MIDI messages post generated note/MIDI events.
- Journey morph start/stop posts generated journey state events.
- Synth/drum reset-home and dice post generated sequencer control events.
- Synth/drum clock division and swing post generated sequencer lane param events.
- Synth/drum step toggles, step-value overrides, and sub-lane configs post generated sequencer step events.
- Source/drum dual ranges, sample-hold ranges, and runtime-walk ranges post generated modulation range events.

## Bounded Dirty Diffs

- Routine `updateParams` and `patchAdapterState` updates create a next generated Product snapshot, compare it to `latestProductSnapshot`, and emit generated param/source-preset/journey/sequencer-lane events when the diff is bounded.
- Source enabled, level, morph, distance, expression, dry gain, FX sends, granular send, post-LPF, stereo width, and post-LPF key tracking are dirty diff events.
- FX, routing, master, RNG, and evolution scalar changes are dirty diff events.
- Source preset ID changes are dirty diff source-preset events when source identity and asset references are unchanged.

## Structural Full Snapshot Reloads

- Initial runtime start/bootstrap loads a full Product snapshot before live events are posted.
- Asset reference changes use a full Product snapshot after host-side asset decode/registration.
- Harmony chord/voicing mode changes use a full Product snapshot until mode-specific events are final.
- Source structure changes use a full Product snapshot: source count, source ID, or source asset ID.
- Exact Pad/Lead compatibility patch changes use a full Product snapshot while those bridge fields remain temporary.
- Sequencer structural changes use a full Product snapshot: lane count mismatch, manual step masks, morph/distance/expression structural fields, bar reset, or phrase reset.
- Dirty diffs exceeding `MAX_SNAPSHOT_DIFF_EVENTS` use a full Product snapshot with reason `dirty-diff-event-budget`.
- Explicit reset requests may load a full snapshot by request.

## Unsupported

- Unknown future modulation range keys increment `unsupportedControlCount` and log in development, but current `core-product` UI range controls are gated to Product-mapped keys before they reach the host.
- Unknown future app-facing `AudioEngine` methods increment `unsupportedControlCount` and log in development through the `core-product` proxy, but required App callsites are statically audited against `CoreProductEngineHost`.
- Placeholder visual getters are either backed by Product telemetry/generated state or hidden/disabled in `core-product`.

## Telemetry

The web host attaches these diagnostics to Product telemetry/perf snapshots:

- `dirtyDiffCount`
- `fullSnapshotReloadCount`
- `unsupportedControlCount`
- `snapshotReloadCpuMs`
- `lastSnapshotReloadReason`
