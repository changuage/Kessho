# Product-core unsupported surface

This inventory tracks production-facing surfaces that are not backed by Product Core semantics yet. The rule is strict: unsupported Product Core paths should throw or be hidden before use. They should not return fake values that make missing behavior look operational. Remaining unsupported entries are explicit crash boundaries, not fallbacks.

| Legacy method / dependency | Current caller(s) | Category | Product replacement | Decision | Status |
| --- | --- | --- | --- | --- | --- |
| `getDynamicsAnalyser` | Dynamics UI only in non-`core-product` mode | Web Audio node leak | Product dynamics visual telemetry | Delete from Product runtime path | Hidden for `core-product`; throws if called |
| `getDrumVoiceAnalyser` | Drum voice card live analyser | Web Audio node leak | Product drum/stem visual telemetry | Replace or delete analyser UI dependency | Now calls host boundary and crashes in `core-product` if requested |
| `getMediaStream` / `getLimiterNode` | Media session bridge and recording/export paths | Web Audio node leak | Product recording/platform-output bridge | Replace with Product bridge | Recording UI hidden for `core-product`; host throws if called |
| `getLeadMorphedParams` | Synth ADSR preview | Legacy source preview | Product source telemetry for resolved Lead envelope | Replace with Product source telemetry | Now calls host boundary and crashes in `core-product` if requested |
| `getCurrentFilterFreq` / `getCurrentLfoValue` / `getCurrentLfo2Value` | Legacy source live display | Legacy source polling | Product source telemetry | Replace with Product telemetry fields | Explicit unsupported host boundary |
| `getRecordableBusNodes` / `getAllStemNodes` | Stem recording/export paths | Web Audio node leak | Product recording bridge over stem buffers | Replace with Product recording bridge | Stem UI hidden for `core-product`; host throws if called |
| `getEarthTextureDebugState` | Earth texture debug UI | Legacy soundscape debug polling | Product soundscape layer telemetry | Replace with Product telemetry fields | UI hidden for `core-product`; host throws if called |
| `getGranularBufferWaveform` | Granular buffer visualizer | Expensive/debug waveform surface | Product granular debug waveform or remove waveform UI | Delete or add explicit Product debug waveform API | Waveform polling hidden for `core-product`; host throws if called |

## Current Gates

- `npm run core:product:runtime-fallbacks` proves missing Product Core methods are forbidden and throw.
- `npm run core:product:getter-policies` proves known getter policies are documented and unsupported host getters throw.
- `npm run migration:unsupported-surface:audit` reports remaining unsupported/fallback/node surfaces.
- `npm run migration:unsupported-surface:gate` fails on any Web Audio node surface, runtime fallback report, undocumented unsupported getter, or stale unsupported policy. The only allowed findings are documented explicit crash boundaries.

Run `node scripts/audit-product-host-unsupported-surface.mjs --fail` only after the table is burned down to zero production findings.
