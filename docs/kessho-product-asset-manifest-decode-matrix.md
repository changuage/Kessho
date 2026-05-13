# Kessho Product Asset Manifest And Decode Matrix

The production asset contract is versioned in `src/audio/coreProductAssetManifest.json`.

## Manifest V1

- Piano uses asset IDs `7201...7264`, rooted at MIDI 21, with `7200 + sampleIndex`.
- The default piano asset is nearest MIDI 60.
- Startup piano preload covers representative low, mid, and high notes: `36, 40, 43, 48, 52, 55, 60, 64, 67, 72, 76, 79, 84`.
- Piano note rendering is on-demand beyond the preload set: hosts register the nearest sample for manual notes and piano sequencer lane min/max/mid before Product Core render.
- Soundscape asset IDs `7101...7106` cover ocean, water, birds, birds2, frogs, and insects.

## Nature Scene Policy

Snapshots carry enabled soundscape asset refs and per-ref levels. Product Core owns loop playback, loop crossfade, deterministic random start, texture-specific level, pan spread, and playback-rate policy. Hosts may decode/register PCM, but may not synthesize replacement soundscape behavior in `core-product`.

Scene-level asset policy is fixed by the manifest and mirrored by the C++ soundscape layer policy:

| Scene | Asset ID | Enable key | Level policy | C++ layer policy |
| --- | --- | --- | --- | --- |
| Ocean | `7101` | `oceanSampleEnabled` | `oceanSampleLevel` | level `0.90..1.00`, pan spread `0.12 + distance*0.28`, rate depth `0.006` |
| Water | `7104` | `waterEnabled` | `waterLevel` | level `0.88..1.00`, pan spread `0.14 + distance*0.26`, rate depth `0.012` |
| Birds | `7102` | `birdsEnabled` | `birdsLevel * natureLevel` | level `0.72..1.00`, pan spread `0.30 + distance*0.62`, rate depth `0.035` |
| Birds 2 | `7105` | `birds2Enabled` | `birds2Level * natureLevel` | level `0.72..1.00`, pan spread `0.30 + distance*0.62`, rate depth `0.035` |
| Frogs | `7103` | `frogsEnabled` | `frogsLevel * natureLevel` | level `0.76..0.96`, pan spread `0.26 + distance*0.48`, rate depth `0.020` |
| Insects | `7106` | `insectsEnabled` or `insects2Enabled` | `max(insectsLevel, insects2Level) * insectsSharedLevel` | level `0.62..0.86`, pan spread `0.36 + distance*0.64`, rate depth `0.045` |

Combined nature scenes include one asset ref per active, non-zero scene layer. Duplicate refs are deduped by asset ID, so the current insects layer pair intentionally resolves to the single committed insects asset until a second release asset exists. Product Core schedules one loop voice per active registered asset ref and applies deterministic random start, level jitter, pan, playback-rate variation, and loop crossfade.

Minimal or degraded scenes must stay silent rather than replaced by host synthesis. With no enabled nature layers, the Product Core soundscape source is disabled and the snapshot carries no soundscape refs. If an enabled layer has no registered asset or decode fails, Product Core missing-asset telemetry owns the failure mode; hosts may retry decode/register but may not fake ocean, water, birds, frogs, or insects audio in `core-product`.

## Decode Matrix

| Runtime | Decoder | Source Format | Bundle Path | Fallback |
| --- | --- | --- | --- | --- |
| Web | `BaseAudioContext.decodeAudioData` | Ogg/Vorbis | `public/samples` | Failed fetch/decode leaves the asset unregistered; Product Core missing-asset telemetry owns the fallback. |
| iOS | `AVAudioFile` | Ogg/Vorbis | `Bundle Resources/samples` | Bundle lookup, `KESSHO_PRODUCT_ASSET_ROOT`, `KESSHO_PRODUCT_ASSET_DOWNLOAD_ROOT`, Application Support/Caches `Kessho/ProductAssets`, then development `public/samples`. |
| macOS | `AVAudioFile` | Ogg/Vorbis | `Bundle Resources/samples` | Bundle lookup, `KESSHO_PRODUCT_ASSET_ROOT`, `KESSHO_PRODUCT_ASSET_DOWNLOAD_ROOT`, Application Support/Caches `Kessho/ProductAssets`, then development `public/samples`. |

## Memory Budgets

- Base WASM heap ceiling: 64 MiB.
- Web worklet heap ceiling after allocating every Product Core registered asset: 384 MiB.
- Startup decoded asset ceiling: 256 MiB.
- Single piano decoded asset ceiling: 4 MiB.
- Single soundscape decoded asset ceiling: 128 MiB.
- Total registered decoded asset ceiling: 384 MiB.

## Measured Decoded Bytes

`core:product:asset-manifest` parses the committed Ogg/Vorbis page headers and final granule positions instead of trusting compressed file sizes. The current committed Product Core asset set accounts for:

- Startup decoded assets: 185,875,176 bytes.
- All regular Product Core piano assets plus all soundscape assets: 224,738,368 decoded bytes.
- Largest piano asset: 1,078,488 decoded bytes.
- Largest soundscape asset: 110,592,000 decoded bytes.
- WASM heap after allocating every Product Core registered asset: 225,705,984 bytes.

## Remaining Blockers

- DEFERRED_WITH_SIGNOFF: iOS/macOS Ogg decode still needs live-device and release-bundle proof; the manifest classifies this as `needs-device-format-proof` / `needs-release-bundle-proof`. Owner: Native Product Core owner. Target follow-up: add TestFlight/App Store-style iOS and signed macOS decode evidence.
- NOT_REQUIRED_FOR_WEB_DEFAULT_WITH_REASON: Network download is not performed inside the render path. Native fallback currently resolves already-downloaded files from configured roots or Application Support/Caches. Reason: web default proof does not require native network download, and native release remains deferred.
- DEFERRED_WITH_SIGNOFF: Hard decoded-byte accounting is enforced against the manifest budgets. Runtime eviction remains part of native release proof. Owner: Native Product Core owner. Target follow-up: add memory-pressure, eviction, and re-registration proof on target devices.
