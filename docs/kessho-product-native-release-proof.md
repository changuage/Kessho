# Kessho Product Native Release Proof

Native release proof is not complete until device and release-bundle evidence exists. This gate records the local proof that can run in CI and keeps the remaining hardware/release blockers explicit instead of silently treating local smoke tests as release approval.

## Locally Proven

- `KesshoProductNativeReleaseSmoke` renders a deterministic Product Core snapshot through the Swift bridge, checks a locked offline golden fingerprint, rejects silence/non-finite samples, and verifies the first audible master block matches the first audible Pad stem block. Run it with `core:product:native-release-smoke`.
- Product Core is the native default runtime; the duplicate Swift DSP graph is selectable only with `KESSHO_NATIVE_AUDIO_ENGINE=legacy-swift`, `legacy`, or `swift`.
- Native recording is wired to Product Core master/stem nodes, with stem source nodes reading C++ Product Core stem buffers.
- The native asset provider resolves bundled samples, explicit `KESSHO_PRODUCT_ASSET_ROOT`, explicit `KESSHO_PRODUCT_ASSET_DOWNLOAD_ROOT`, Application Support/Caches download roots, and development `public/samples`.
- `AVAudioSourceNode` render callbacks are statically audited for bounded frame counts and no file/network/JSON/lock/allocation tokens in callback bodies.

## Hardware/Release Blockers

- `native-default-deferred`: Product Core can remain the native default for development, but Product Default Gate v2 cannot pass on native until the blockers below have signed-off evidence.
- `needs-device-cpu-battery-thermal-proof`: iOS device CPU, battery, thermal, underrun, and background/screen-off captures are not available from local SwiftPM smoke tests.
- `needs-route-change-session-proof`: real iOS AVAudioSession interruption, route-change, Bluetooth, speaker/headphone, lock-screen, and background-resume behavior still needs device validation.
- `needs-release-bundle-decode-proof`: App Store/TestFlight-style iOS and signed macOS release bundles must prove bundled/downloaded piano and soundscape assets decode and register on target devices.
- `needs-native-avsource-hardware-timing-proof`: the local bridge/stem timing proof does not replace AVAudioSourceNode timing under live hardware IO.

## Gate Policy

`core:product:native-release` may pass with the blockers above present; it enforces release-proof wiring and callback boundaries. `core:product:native-release-smoke` runs the Swift executable that locks the local offline render golden. Product Default Gate v2 must still fail unless native default is explicitly deferred with signed-off blockers or the hardware/release evidence is added.
