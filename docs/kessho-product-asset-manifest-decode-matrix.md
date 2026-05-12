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

- iOS/macOS Ogg decode still needs live-device and release-bundle proof; the manifest classifies this as `needs-device-format-proof` / `needs-release-bundle-proof`.
- Network download is not performed inside the render path. Native fallback currently resolves already-downloaded files from configured roots or Application Support/Caches.
- Hard decoded-byte accounting is enforced against the manifest budgets. Runtime eviction remains part of native release proof.
