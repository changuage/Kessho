# Kessho Product Level Calibration

Status: **PASS**

Commands:

- `node scripts/run-kessho-product-cpp-test.mjs ProductGainStagingValidationTests` (build + deterministic fixture)
- `./build/kessho-core/product-tests/ProductGainStagingValidationTests` (same binary, repeat/hash check)
- CI integration: `core:product:level-calibration` is a prerequisite in `scripts/run-kessho-product-ci.mjs`, reached by `.github/workflows/product-core-ci.yml` through `npm run core:product:ci:prereqs`.

Thresholds:

- Source RMS tolerance: ±3 dB against the checked-in representative fixtures (Pad, Lead, fixed-asset Piano, two-bar drums, and Soundscape/Earth).
- FX structural tolerance: ±3 dB for the measured fixed-input Delay A/B, Granular, and Reverb branches; focused FX routing tests cover the other nodes.
- Pre-limiter peak ceiling: 0.95 linear; limiter inactivity epsilon: 0.05 dB.
- The two-bar drum fixture is nominal-level evidence: its pre-limiter peak and limiter reduction are checked independently, so a clipped/baseline-locked drum pattern cannot pass.
- CPU regression is enforced by the adjacent `core:product:cpu` prerequisite in the same Product CI graph; this standalone level gate does not duplicate that compilation/run.

| Fixture | RMS | Peak |
| --- | ---: | ---: |
| sustained_pad_metal_tine_c4 | 6.942660e-2 | 1.672922e-1 |
| sustained_lead_soft_rhodes_c4 | 6.771744e-2 | 1.611338e-1 |
| sustained_piano_fixed_asset_c4 | 9.016424e-2 | 1.323704e-1 |
| drums.master | 4.868991e-2 | 9.972352e-1 |
| drums.dry | 4.057492e-2 | 8.310294e-1 |
| drums.pre_limiter | 4.057492e-2 | 8.310294e-1 |
| earth.master | 2.123367e-5 | 1.472217e-4 |
| earth.water_dry | 1.769473e-5 | 1.226847e-4 |

| FX branch | RMS | Peak |
| --- | ---: | ---: |
| delay_a_main | 1.437549e-1 | 2.771158e-1 |
| delay_a_reverb | 1.437549e-1 | 2.771158e-1 |
| delay_b_main | 8.629176e-2 | 1.967846e-1 |
| delay_b_reverb | 8.629176e-2 | 1.967846e-1 |
| granular_main | 1.610705e-3 | 1.672019e-2 |
| granular_reverb | 4.922024e-3 | 5.108451e-2 |
| reverb_main | 3.845277e-2 | 1.156094e-1 |

Drum pre-limiter peak: 8.310294e-1; drum limiter reduction: 0.000000 dB.
Headroom pre-limiter peak: 2.385129e-1; limiter reduction: 0.000000 dB.
