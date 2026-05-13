# Kessho Product Native Release Proof

Native release proof is not complete until device and release-bundle evidence exists. This gate records the local proof that can run in CI and keeps the remaining hardware/release blockers explicit instead of silently treating local smoke tests as release approval.

## Locally Proven

- `KesshoProductNativeReleaseSmoke` renders a deterministic Product Core snapshot through the Swift bridge, checks a locked offline golden fingerprint, rejects silence/non-finite samples, and verifies the first audible master block matches the first audible Pad stem block. Run it with `core:product:native-release-smoke`.
- Product Core is the native default runtime; the duplicate Swift DSP graph is selectable only with `KESSHO_NATIVE_AUDIO_ENGINE=legacy-swift`, `legacy`, or `swift`.
- Native recording is wired to Product Core master/stem nodes, with stem source nodes reading C++ Product Core stem buffers.
- The native asset provider resolves bundled samples, explicit `KESSHO_PRODUCT_ASSET_ROOT`, explicit `KESSHO_PRODUCT_ASSET_DOWNLOAD_ROOT`, Application Support/Caches download roots, and development `public/samples`.
- `AVAudioSourceNode` render callbacks are statically audited for bounded frame counts and no file/network/JSON/lock/allocation tokens in callback bodies.

## Hardware/Release Blockers

- `native-default-deferred`: Product Core can remain the native default for development, but Product Default Gate v3 cannot pass native release readiness until the blockers below have signed-off evidence.

| Blocker | Required proof | Current status |
| --- | --- | --- |
| `needs-device-cpu-proof` | Physical iOS and signed macOS CPU captures for representative Product Core scenes, including p95/p99 render cost and underrun counters. | Deferred; local CPU smoke is not live-device proof. |
| `needs-battery-thermal-proof` | Battery drain and thermal-state captures on physical iOS hardware during sustained foreground playback. | Deferred; no device capture is checked in. |
| `needs-screen-off-background-proof` | Screen-off, lock-screen, background, and foreground-resume playback behavior on device. | Deferred; local SwiftPM smoke cannot exercise OS background policy. |
| `needs-route-change-proof` | Speaker, wired headphone, Bluetooth, AirPlay if supported, sample-rate, and buffer-size route transitions during playback. | Deferred; route switching requires live AVAudioSession evidence. |
| `needs-interruption-proof` | Call, Siri, alarm, ducking, and media-services-reset interruption handling, including resume behavior. | Deferred; notification handlers exist but are not release evidence. |
| `needs-release-bundle-decode-proof` | TestFlight/App Store-style iOS and signed macOS bundles decode and register bundled and downloaded Product Core assets. | Deferred; release-bundle coverage is absent. |
| `needs-native-ogg-coverage-proof` | Every committed piano and soundscape Ogg/Vorbis asset decodes through native `AVAudioFile` on target OS/device combinations. | Deferred; manifest parse coverage is local and does not prove native Ogg decode. |
| `needs-native-avsource-hardware-timing-proof` | `AVAudioSourceNode` master callback meets live hardware IO deadlines without oversized frame requests or render-thread boundary violations. | Deferred; static callback audit is not hardware timing proof. |
| `needs-live-stem-timing-proof` | Product Core master and stem taps remain sample-aligned under live-device playback and recording. | Deferred; offline smoke aligns master and Pad stem only. |
| `needs-native-asset-eviction-memory-pressure-proof` | Decoded asset cache behavior under memory pressure, warnings, eviction, and asset re-registration on iOS/macOS. | Deferred; memory budgets are enforced locally, not eviction behavior. |

Compatibility blocker aliases retained for gate continuity:

- `needs-device-cpu-battery-thermal-proof`
- `needs-route-change-session-proof`

## Native Default Deferral Mapping

Status: DEFERRED_WITH_SIGNOFF

Owner: Native Product Core owner

Reason: live-device CPU, battery, thermal, route, interruption, background, release-bundle decode, Ogg, AVAudioSourceNode timing, stem timing, and memory-pressure proof is absent.

Sign-off: Product Core migration owner signs off only on keeping native release default deferred while local development continues to use Product Core.

Target follow-up: native-release-device-proof

```yaml
native-default-deferred:
  owner: native-release-owner
  reason: live-device CPU, battery, thermal, route, interruption, background, release-bundle decode, Ogg, AVAudioSourceNode timing, stem timing, and memory-pressure proof is absent
  signOffStatus: signed-for-deferral-only
  targetFollowUp: native-release-device-proof
```

## Gate Policy

`core:product:native-release` may pass with the blockers above present; it enforces release-proof wiring, deferral mapping, machine-readable report output, and callback boundaries. `core:product:native-release-smoke` runs the Swift executable that locks the local offline render golden. Product Default Gate v3 must still block native release readiness unless native default is explicitly deferred with signed-off blockers or the hardware/release evidence is added.
