# Product-core unsupported surface

This inventory tracks production-facing surfaces that are not backed by Product Core semantics yet. The rule is strict: unsupported Product Core paths should be retired from the host or hidden before use. They should not return fake values that make missing behavior look operational.

| Legacy method / dependency | Current caller(s) | Category | Product replacement | Decision | Status |
| --- | --- | --- | --- | --- | --- |
| None | Product Core host | Unsupported getter surface | Product telemetry-backed host methods | Keep burned down | Zero production findings |

Retired from the Product Core host surface: `getCurrentFilterFreq`, `getCurrentLfoValue`, and `getCurrentLfo2Value`. Production UI no longer calls these source-wide polling getters; Pad-specific live display uses Product Core telemetry through `getCurrentPadFilterFreq` and `getCurrentPadLfoValue`.

Retired recording/platform Web Audio node getters: `getMediaStream`, `getLimiterNode`, `getRecordableBusNodes`, and `getAllStemNodes`. Production recording controls remain hidden in `core-product`; future recording support must use an explicit Product recording bridge rather than raw Web Audio nodes.

Retired visual/debug getters: `getDynamicsAnalyser`, `getDrumVoiceAnalyser`, `getGranularBufferWaveform`, `getLeadMorphedParams`, and `getEarthTextureDebugState`. Product Core UI paths now use Product telemetry-backed alternatives where available and disable the remaining debug/node polling surfaces before host calls can occur.

## Tracked Temporary Compatibility

`applySequencerUiPatch` is not an unsupported production getter or fallback, but it is a temporary compatibility bridge. It remains only because Product Core does not yet own generated event or dirty-diff paths for sequencer evolve configs, sub-lane config payloads, step override batches, pitch settings, and home-capture cache updates. Do not hide those gaps with full snapshot reloads or new one-off `ProductEnginePort` setters.

## Current Gates

- `npm run core:product:runtime-fallbacks` proves missing Product Core methods are forbidden and throw.
- `npm run core:product:getter-policies` proves known getter policies are documented and retired getter surfaces stay out of the Product Core host.
- `npm run migration:unsupported-surface:audit` reports remaining unsupported/fallback/node surfaces.
- `npm run migration:unsupported-surface:gate` fails on any Web Audio node surface, runtime fallback report, undocumented unsupported getter, or stale unsupported policy. The target state is zero production findings.

Run `node scripts/audit-product-host-unsupported-surface.mjs --fail` to enforce zero production findings.
