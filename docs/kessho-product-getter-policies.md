# Kessho Product Getter Policies

Getter policies in `core-product` must be visible Product Core blockers. Supported getters are backed by Product Core telemetry or generated Product state. Unsupported Web Audio/reference-only surfaces are retired from the Product Core host surface and must be hidden or gated before they are reached. Missing getters that are not listed here are forbidden production fallbacks, even when their names look like telemetry, debug, analyser, or visual helpers.

| Getter | Classification | Retirement condition |
| --- | --- | --- |
| `getDynamicsVisualTelemetry` | `backed-by-product-core-api` | Backed by Product Core master/dynamics telemetry; analyser nodes remain unavailable in `core-product`. |
| `getGranularActiveGrainCount` | `backed-by-product-core-api` | Backed by Product Core `activeGrains` telemetry. |
| `getGranularVoicePositions` | `backed-by-product-core-api` | Backed by Product Core granular voice position telemetry. |
| `getGranularWriteHeadPosition` | `backed-by-product-core-api` | Backed by Product Core granular write-head telemetry. |
| `getCurrentPadFilterFreq` | `backed-by-product-core-api` | Backed by Product Core Pad source filter telemetry. |
| `getCurrentPadLfoValue` | `backed-by-product-core-api` | Backed by Product Core Pad source LFO telemetry. |
| `getTransportDebugState` | `backed-by-product-core-api` | Backed by Product Core transport telemetry and generated transport snapshot state. |

Allowed classifications are:

- `backed-by-product-core-api`
