# Background Audio Requirements

Product Core background audio has two separate support levels:

- Browser and mobile web playback is best-effort only.
- Reliable iOS/macOS background audio requires a native Product Core render path.

Browser/mobile web must never be presented as guaranteed background playback. Safari, Chrome, and operating systems can suspend JavaScript, AudioContext work, timers, page lifecycle work, Media Session callbacks, or wake locks while a page is hidden, locked, or resource constrained.

Native iOS/macOS may be presented as reliable only after the native Product Core renderer, platform audio session integration, event routing, asset handling, telemetry, and device tests pass.

## Browser And Mobile Web Best-Effort Scope

Browser/mobile support is scoped to foreground stability and graceful recovery from page lifecycle changes. The product may expose status and controls for these features, but the UI must state that lock-screen and app-background playback are best-effort and not guaranteed on browser/mobile web.

Required browser/mobile behavior:

- Foreground playback remains stable under the `core-product` runtime.
- A visible-page Wake Lock mode is available where the Wake Lock API is supported.
- Media Session metadata and Media Session play/pause/stop actions are registered where supported.
- Page Visibility diagnostics record visible/hidden transitions.
- Page Lifecycle diagnostics record freeze/resume/pagehide/pageshow style transitions where supported.
- AudioContext suspension or interruption is diagnosed, and the app attempts graceful resume after suspension when the user returns.
- User-facing limitations clearly distinguish foreground playback from best-effort hidden, screen-lock, or app-switch playback.

Browser/mobile non-goals:

- Do not promise guaranteed browser/mobile background playback.
- Do not rely on silent audio hacks to keep browser playback alive.
- Do not route Product Core render through non-realtime-safe browser workarounds.
- Do not reintroduce `web-ts` as a production fallback.

## Native iOS/macOS Reliable Background Scope

Reliable iOS/macOS background audio requires a native renderer that calls Product Core directly from the platform audio render callback. Product events, snapshots, assets, and telemetry may cross host boundaries, but realtime audio buffers must not be sent through JavaScript or the Capacitor bridge.

Native requirements before reliable background support can be claimed:

- `NativeProductRuntime` owns the native Product Core runtime lifecycle.
- A native C++ Product Core library/framework is built and linked for the target platform.
- The platform render callback calls `kessho_product_render` directly.
- No realtime audio buffers pass through JS or the Capacitor bridge.
- A lock-free event queue moves Product events into the audio thread without blocking.
- A telemetry double buffer copies renderer state out of the audio thread without blocking.
- Native asset registration happens off the audio thread.
- `AVAudioSession` is configured for playback/background audio integration on iOS.
- The iOS app declares `UIBackgroundModes` audio before any native background behavior can be tested or claimed.
- The macOS app target links `KesshoProductCore` directly and exposes native Product Core diagnostics through the existing platform bridge surface.
- `npm run core:product:macos-app-native-smoke` proves the macOS app executable can probe, start, and stop the native diagnostic renderer without opening the GUI.
- `npm run core:product:macos-app-background-smoke` proves the macOS app host can drive hidden and sleep/wake recovery handlers against the native diagnostic renderer without opening the GUI.
- Now Playing metadata and remote commands are wired for lock-screen and Control Center transport.
- Route change and interruption handling is implemented and tested.
- Native diagnostics can prove non-silent Product Core output with scalar peak/RMS values only; realtime audio buffers must remain native.
- `?audioSession=debug&nativeProduct=diagnostic` may be used for device diagnostics: it probes native Product Core output, shows scalar peak/RMS plus native remote-command, route, interruption, and media-services counters in the Product Core debug panel, and starts the native diagnostic renderer from the normal playback gesture.
- Device tests cover screen lock, app background, remote commands, route changes, interruption, and recovery.
- Device-test pass/fail evidence is recorded in `docs/product-core/background-audio-device-evidence.md`.

## Release Contract

Until the native path above passes build, render, event, snapshot, asset, telemetry, and device tests, native bridge capability must remain disabled. `supports_native_bridge` stays `0`, `ProductEnginePort.getCapabilityReport()` keeps `supportsNativeBridge: false`, and the app must not imply native background audio support.
