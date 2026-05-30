# Background Audio Device Evidence

This ledger records the physical device evidence required before BG2 can close
and before BG3 may flip native bridge capability. Browser/mobile rows remain
best-effort evidence only. Native iOS/macOS rows are release blockers.

## How To Test Native iOS

1. Build and install the Capacitor app on a physical iOS device.
2. Open `?audioSession=debug&nativeProduct=diagnostic`.
3. Start playback from the normal app control.
4. Confirm the Product Core debug panel shows a native scalar probe with
   non-zero peak/RMS and no native renderer error.
5. Confirm the installed app uses an iOS build with `UIBackgroundModes` audio.
6. For Control Center, route, interruption, and media-services cases, confirm
   the Product Core debug panel shows the native command/event/counter change.
7. Run each row below once. If an expensive or flaky case fails once, record the
   result as `manual-pending` or `fail` instead of repeating loops.

## Evidence Format

Rows may stay `pending` with `-` evidence/tester/date until the physical test is
run. Any `manual-pending`, `fail`, or `pass` row must include concrete evidence,
a tester, and a `YYYY-MM-DD` date.

Pass evidence must use semicolon-separated key/value tokens so the release gate
can verify the required proof without parsing prose:

- `ios-native-foreground`: `build=...; peak=...; rms=...; audible=yes`
- `ios-native-screen-lock`: `build=...; peak=...; rms=...; screenLockAudio=continues`
- `ios-native-app-background`: `build=...; peak=...; rms=...; appBackgroundAudio=continues`
- `ios-native-control-center`: `build=...; remoteCommand=...; playPause=pass`
- `ios-native-route-change`: `build=...; routeChangeCount=...; interruptionBeginCount=...; audioRecovers=yes`
- `macos-native-hidden`: `build=...; peak=...; rms=...; hiddenAudio=continues`
- `macos-native-sleep-wake`: `build=...; interruptionBeginCount=...; interruptionEndCount=...; mediaServicesResetCount=...; audioRecovers=yes`

Use `npm run core:product:background-audio-device-evidence:record -- --id=... --status=... --evidence="..." --tester="..." --date=YYYY-MM-DD` to update a row. Add `--dry-run` first to validate the row format without writing the ledger.

Use `npm run core:product:background-audio-device-checklist` to print a
row-by-row physical test checklist generated from the same evidence contract.

## Evidence Matrix

| ID | Platform | Scenario | Required evidence | Status | Evidence | Tester | Date |
|---|---|---|---|---|---|---|---|
| ios-native-foreground | iOS device Capacitor native | diagnostic foreground start | Audible native Product Core output; debug panel native peak/RMS > 0 | pending | - | - | - |
| ios-native-screen-lock | iOS device Capacitor native | screen lock | Audio continues through native Product Core after screen lock | pending | - | - | - |
| ios-native-app-background | iOS device Capacitor native | app background | Audio continues while app is backgrounded within iOS background audio rules | pending | - | - | - |
| ios-native-control-center | iOS device Capacitor native | Control Center play/pause | Remote play/pause updates playback; Product Core debug panel shows remote command evidence | pending | - | - | - |
| ios-native-route-change | iOS device Capacitor native | AirPods route change | Route/interruption counters update in Product Core debug panel and audio recovers | pending | - | - | - |
| macos-native-hidden | macOS native | app hidden/minimized | Native Product Core audio continues while app is hidden/minimized | pending | - | - | - |
| macos-native-sleep-wake | macOS native | sleep/wake | Native renderer recovers safely after sleep/wake | pending | - | - | - |

## Release Rule

`supports_native_bridge` must remain `0` until every native row above is
recorded as `pass` with concrete evidence, tester, and date.
