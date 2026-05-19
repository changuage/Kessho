# Kessho Product Getter Policies

Getter policies in `core-product` must be visible Product Core blockers. Unsupported Web Audio/reference-only surfaces must throw when called; UI code should hide or gate those paths before they are reached.

| Getter | Classification | Retirement condition |
| --- | --- | --- |
| `getDynamicsAnalyser` | `explicitly-unsupported-hidden` | Web Audio dynamics analyser nodes are not passed to `core-product`; Product Core telemetry backs dynamics visuals instead. |
| `getDynamicsVisualTelemetry` | `backed-by-product-core-api` | Backed by Product Core master/dynamics telemetry; analyser nodes remain unavailable in `core-product`. |
| `getDrumVoiceAnalyser` | `explicitly-unsupported-hidden` | Web Audio drum analyser nodes are not passed to `core-product`; drum envelope visuals remain state-based without live analyser input. |
| `getGranularActiveGrainCount` | `backed-by-product-core-api` | Backed by Product Core `activeGrains` telemetry. |
| `getGranularBufferWaveform` | `backed-by-product-core-api` | Core-product uses low-cost granular head/voice telemetry; waveform samples intentionally stay null to avoid realtime buffer copies. |
| `getGranularVoicePositions` | `backed-by-product-core-api` | Backed by Product Core granular voice position telemetry. |
| `getGranularWriteHeadPosition` | `backed-by-product-core-api` | Backed by Product Core granular write-head telemetry. |
| `getLeadMorphedParams` | `explicitly-unsupported-hidden` | Lead morphed-parameter preview is disabled in `core-product` until Product Core exposes resolved Lead source telemetry. |
| `getCurrentFilterFreq` | `explicitly-unsupported-hidden` | Live source filter telemetry polling is disabled in `core-product` until Product Core exposes source debug telemetry. |
| `getCurrentLfoValue` | `explicitly-unsupported-hidden` | Live source LFO telemetry polling is disabled in `core-product` until Product Core exposes source debug telemetry. |
| `getCurrentLfo2Value` | `explicitly-unsupported-hidden` | Live secondary LFO telemetry polling is disabled in `core-product` until Product Core exposes source debug telemetry. |
| `getCurrentPadFilterFreq` | `explicitly-unsupported-hidden` | Live Pad filter telemetry polling is disabled in `core-product` until Product Core exposes source debug telemetry. |
| `getCurrentPadLfoValue` | `explicitly-unsupported-hidden` | Live Pad LFO telemetry polling is disabled in `core-product` until Product Core exposes source debug telemetry. |
| `getRecordableBusNodes` | `explicitly-unsupported-hidden` | Stem recording UI is hidden in `core-product`; Product Core exposes stem buffers/peaks rather than Web Audio bus nodes. |
| `getAllStemNodes` | `explicitly-unsupported-hidden` | Stem recording UI is hidden in `core-product`; Product Core exposes stem buffers/peaks rather than Web Audio bus nodes. |
| `getEarthTextureDebugState` | `explicitly-unsupported-hidden` | Earth texture debug polling is disabled in `core-product` until Product Core exposes soundscape layer debug telemetry. |
| `getTransportDebugState` | `backed-by-product-core-api` | Backed by Product Core transport telemetry and generated transport snapshot state. |

Allowed classifications are:

- `backed-by-product-core-api`
- `explicitly-unsupported-hidden`
- `reference-only-web-ts-behavior`
- `temporary-missing-product-telemetry`
