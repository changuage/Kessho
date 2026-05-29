# Product-core unsupported surface

This inventory tracks production-facing surfaces that are not backed by Product Core semantics yet. The rule is strict: unsupported Product Core paths should be retired from the host or hidden before use. They should not return fake values that make missing behavior look operational.

| Legacy method | Caller | Decision | Product replacement | Status | Ticket |
| --- | --- | --- | --- | --- | --- |
| `getAllStemNodes` | recording | replace with product concept | ProductRecordingBridge/stems | retired | product-core-recording-stems |
| `getRecordableBusNodes` | recording | replace with product concept | ProductRecordingBridge/stems | retired | product-core-recording-stems |
| `getMediaStream` | media-session | replace with product concept | Product platform audio-session bridge | retired | product-core-platform-audio-session |
| `getDynamicsAnalyser` | visualizer | replace with product concept | ProductVisualTelemetryFrame | retired | product-core-visual-telemetry |
| `getDrumVoiceAnalyser` | drum visualizer | replace with product concept | ProductVisualTelemetryFrame | retired | product-core-visual-telemetry |
| `getLimiterNode` | none/internal | delete | none | retired | product-core-delete-raw-node-getters |
| `getGranularBufferWaveform` | granular visualizer | replace with product concept | Product telemetry waveform summary | retired | product-core-granular-visual-telemetry |
| `getLeadMorphedParams` | debug/reference | dev/reference-only | Product telemetry/debug snapshot | retired | product-core-debug-telemetry |
| `getEarthTextureDebugState` | debug/reference | dev/reference-only | Product telemetry/debug snapshot | retired | product-core-debug-telemetry |

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
- `npm run migration:no-unsupported-product-surface` is the public alias for the unsupported-surface production gate.
- `npm run migration:runtime-production-gates` verifies diagnostic counters, unsupported-surface policy decisions, capability report facts, and gate wiring.

Run `npm run migration:no-unsupported-product-surface` to enforce zero production findings.
