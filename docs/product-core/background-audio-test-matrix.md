# Background Audio Test Matrix

This matrix separates browser/mobile best-effort behavior from native reliable background support. Browser rows are not product guarantees; they are validation targets for the best behavior the platform allows. Native rows become release guarantees only when the native Product Core renderer is active and device tests pass.

| Platform | Scenario | Expected | Status | Notes |
|---|---|---|---|---|
| iOS Safari | foreground | best-effort pass | todo | Ear test foreground stability; no browser background guarantee implied. |
| iOS Safari | screen lock | best-effort / not guaranteed | todo | Mark as manual/ear test after first flaky or expensive failure. |
| iOS Safari | app switch | best-effort / not guaranteed | todo | Mark as manual/ear test after first flaky or expensive failure. |
| Android Chrome | foreground | best-effort pass | todo | Ear test foreground stability; no browser background guarantee implied. |
| Android Chrome | screen lock | best-effort / not guaranteed | todo | Mark as manual/ear test after first flaky or expensive failure. |
| Capacitor iOS native | native output probe | non-silent scalar peak/RMS | local pass | `?audioSession=debug&nativeProduct=diagnostic` runs `probeNativeRendererForDiagnostics`; scalar diagnostics are visible in the Product Core debug panel. |
| Capacitor iOS native | diagnostic foreground start | audible native Product Core output | build pass / device ear test pending | `?audioSession=debug&nativeProduct=diagnostic` starts a primed Product Core AVAudioEngine path; verify on device by ear. |
| Capacitor iOS native | screen lock | guaranteed if native renderer active | todo | Requires `NativeProductRuntime`, direct `kessho_product_render` callback, and device ear test. |
| Capacitor iOS native | app background | guaranteed within iOS background audio rules | todo | Requires AVAudioSession playback/background audio integration and device proof. |
| Capacitor iOS native | Control Center play/pause | pass | todo | Requires Now Playing metadata and remote commands. |
| Capacitor iOS native | AirPods route change | pass | todo | Requires route change and interruption handling. |
| macOS native | native output probe | non-silent scalar peak/RMS | local pass | `npm run core:product:macos-native-smoke` verifies the shared Apple renderer output probe. |
| macOS native | app hidden/minimized | pass | todo | Requires native Product Core render path and manual/device proof. |
| macOS native | sleep/wake | safe recovery | todo | Requires tested native interruption/recovery behavior. |

## Validation Policy

Run cheap static and unit gates freely. For expensive browser/mobile background checks, run a single attempt when needed; if the first attempt is flaky, platform-limited, or expensive to repeat, record the row as a manual ear test item instead of burning cycles on repeated reruns.

Native release-blocking evidence is recorded in
`docs/product-core/background-audio-device-evidence.md`. BG3 must remain blocked
until every native row in that ledger is `pass` with evidence, tester, and date.
