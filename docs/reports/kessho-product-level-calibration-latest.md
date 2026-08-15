# Kessho Product Level Calibration

Status: **PASS**

Commands:

- `node scripts/run-kessho-product-cpp-test.mjs ProductGainStagingValidationTests` (build + deterministic fixture)
- `node scripts/check-kessho-product-sample-asset-loudness.mjs` (decode and measure all checked-in OGG assets; compact report: `docs/reports/kessho-product-sample-asset-loudness-latest.json`)
- `node scripts/run-kessho-product-cpp-test.mjs ProductFxLoudnessMeasurementTests` (Product FX loudness fixture set and delta-LU contract)
- `./build/kessho-core/product-tests/ProductGainStagingValidationTests` (same binary, repeat/hash check)
- CI integration: `core:product:level-calibration` is a prerequisite in `scripts/run-kessho-product-ci.mjs`, reached by `.github/workflows/product-core-ci.yml` through `npm run core:product:ci:prereqs`.

Thresholds:

- Source RMS tolerance: ±3 dB against the checked-in representative fixtures (Pad, Lead, fixed-asset Piano, two-bar drums, and Soundscape/Earth).
- FX structural tolerance: ±3 dB for the measured fixed-input Delay A/B, Granular, and Reverb branches; focused FX routing tests cover the other nodes.
- Product FX loudness delta tolerance: ±1 LU; spectral differences are intentionally not compared across engines.
- Source loudness tolerance: ±1 LU; Earth uses the explicit active_window_ungated mode.
- Pre-limiter peak ceiling: 0.95 linear; limiter inactivity epsilon: 0.05 dB.
- The two-bar drum fixture is nominal-level evidence: its pre-limiter peak and limiter reduction are checked independently, so a clipped/baseline-locked drum pattern cannot pass.
- CPU regression is enforced by the adjacent `core:product:cpu` prerequisite in the same Product CI graph; this standalone level gate does not duplicate that compilation/run.

| Fixture | RMS | Peak |
| --- | ---: | ---: |
| sustained_pad_metal_tine_c4 | 5.237015e-2 | 1.672922e-1 |
| sustained_lead_soft_rhodes_c4 | 5.073376e-2 | 1.611338e-1 |
| sustained_piano_fixed_asset_c4 | 8.554263e-2 | 1.323704e-1 |
| drums.master | 4.868991e-2 | 9.972352e-1 |
| drums.dry | 4.057492e-2 | 8.310294e-1 |
| drums.pre_limiter | 4.057492e-2 | 8.310294e-1 |
| earth.master | 4.936870e-5 | 2.647829e-4 |
| earth.water_dry | 4.114059e-5 | 2.206524e-4 |

| FX branch | RMS | Peak |
| --- | ---: | ---: |
| delay_a_main | 1.419818e-1 | 2.771829e-1 |
| delay_a_reverb | 1.419818e-1 | 2.771829e-1 |
| delay_b_main | 8.395189e-2 | 1.967846e-1 |
| delay_b_reverb | 8.395189e-2 | 1.967846e-1 |
| granular_main | 4.356953e-3 | 1.887561e-2 |
| granular_reverb | 1.327302e-2 | 5.763481e-2 |
| reverb_main | 5.011238e-2 | 1.605471e-1 |

| Product FX loudness fixture | Delta LU | Output LUFS |
| --- | ---: | ---: |
| delay_a_matched_100ms | -2.764612 | -17.206226 |
| delay_b_matched_100ms_activity0 | -7.985923 | -22.427537 |
| delay_b_matched_100ms_activity1 | 4.725589 | -9.716026 |
| reverb_controlled | -16.175750 | -30.615580 |
| granular_controlled | -9.095928 | -23.538562 |
| degrade_drift_controlled | -2.980891 | -17.429668 |
| spectral_freeze_controlled | -4.116252 | -18.558437 |
| eq1_neutral | 0.000000 | -14.448591 |
| eq2_neutral | 0.000000 | -14.448591 |
| sidechain_neutral | 0.000000 | -14.448591 |
| creative_saturation_controlled | 3.052715 | -11.395876 |

| Source loudness fixture | LUFS | Mode |
| --- | ---: | --- |
| sustained_pad_metal_tine_c4 | -20.107448 | bs1770_integrated |
| sustained_lead_soft_rhodes_c4 | -23.768285 | bs1770_integrated |
| sustained_piano_fixed_asset_c4 | -19.112356 | bs1770_integrated |
| drums.master | -23.535140 | bs1770_integrated |
| drums.dry | -25.118765 | bs1770_integrated |
| drums.pre_limiter | -25.118765 | bs1770_integrated |
| earth.master | -82.174191 | active_window_ungated |
| earth.water_dry | -83.757816 | active_window_ungated |

Drum pre-limiter peak: 8.310294e-1; drum limiter reduction: 0.000000 dB.
Headroom pre-limiter peak: 2.385129e-1; limiter reduction: 0.000000 dB.
