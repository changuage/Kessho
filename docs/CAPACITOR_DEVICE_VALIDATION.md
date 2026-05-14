# Capacitor Device Validation

## Purpose

This runbook covers the release-confidence layer that Product Core CI does not
prove by itself: real-device background audio, CPU, battery, route changes, and
MIDI behavior for Kessho Capacitor. The audio engine under test is the Product
Core path unless a run explicitly opts into a legacy runtime.

## Required Baseline Before Device Work

Run these from the repo root before opening a device build:

```sh
npm run type-check
npm run core:product:ci:prereqs
npm run core:product:default-gate-v3
```

Pass criteria:

- Product Core CI prerequisite report status is `pass`
- Product Default Gate v3 status is `pass`
- generated reports under `docs/reports/` record the run locally

## iOS Capacitor Device Gate

Build and launch:

```sh
npm run cap:sync:ios
npm run cap:open:ios
```

Use a real iPhone or iPad. Simulator results do not prove background audio,
Bluetooth, route changes, thermal behavior, or screen-off stability.

Required passes:

- App identity shows `Kessho Capacitor`.
- The app starts playback from the normal React UI with Product Core worklets
  loaded and no visible browser/core error overlay.
- Audio continues for at least 30 minutes with the screen locked.
- CPU remains stable enough that the device does not thermal-throttle into
  audible glitches during a representative full mix.
- Playback survives AirPods/Bluetooth connect and disconnect.
- Playback survives switching output between speaker, headphones, and Bluetooth
  where available.
- Playback resumes or fails gracefully after an interruption such as Siri, phone
  call simulation, alarm, or another media app taking focus.
- Now Playing metadata appears when the audio-session bridge is enabled.
- Remote play/pause controls reach the web UI when the audio-session bridge is
  enabled.
- Hardware MIDI input can connect, learn a route, move a target parameter, and
  keep doing so while audio is running.

Suggested scenarios:

- quiet pad-only state
- delay/reverb-heavy pad state
- granular routing state
- drum delay state
- full-mix gamelan state
- full-mix dark ambient state

Record for each scenario:

- device model and iOS version
- power mode and battery percentage at start/end
- audio route
- sample rate and buffer size if available
- average CPU, peak CPU, and any thermal warnings
- glitches, dropouts, or stuck notes
- whether screen-off playback passed

## macOS Capacitor Gate

Build and launch:

```sh
npm run cap:mac:build
npm run cap:mac:open
```

Required passes:

- The app launches from `build/macos/Kessho Capacitor.app`.
- Product Core WASM assets load from the bundled localhost server.
- Playback starts from the React UI and keeps running while the window is
  backgrounded.
- App Nap and idle sleep suppression engage while playback is active.
- CoreMIDI discovery, connection, route learning, and parameter updates work
  with a real MIDI controller.
- CPU stays in the same broad band as the browser baseline for the same preset.

## Failure Policy

Treat these as blockers before defaulting a Capacitor release to Product Core:

- screen-off iOS playback stops unexpectedly
- repeated audio dropouts, non-finite output, or stuck notes
- route changes leave the app silent until force quit
- MIDI input stops being delivered while audio continues
- CPU or thermal behavior is materially worse than the browser Product Core
  baseline for the same state

Do not mark a device issue solved by changing browser corpus thresholds. Device
failures should be fixed either in the Capacitor platform bridge, the host
packaging, or the shared C++/WASM audio path that actually caused the failure.

## Artifact Checklist

For every serious device run, keep:

- the latest Product Core reports from `docs/reports/`
- the commit SHA under test
- Xcode device logs or Console.app logs for failures
- a short note with scenario, route, CPU/thermal observations, and pass/fail
- screenshots only when they clarify app state, not as a substitute for audio
  observations
