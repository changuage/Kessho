# Kessho Native Device Proof

## Build metadata
- Commit: 5f3e850e6932be1e2acae0e1b9a8de68bf486c0e
- Date: 2026-06-27T23:02:00Z
- Tester: local automation
- Device/Simulator: macOS local host; iPhone 17 iOS Simulator 26.3.1
- OS version: macOS 15.7.4 (24G517); iOS Simulator 26.3.1
- Build type: local debug/native smoke plus iOS simulator app smoke

## Required checks

| Check | Required result | Actual result | Notes |
|---|---|---|---|
| macOS app launches | PASS | PASS | `npm run core:product:macos-app-native-smoke` built and launched `KesshoCapacitorMac`. |
| macOS Product Core starts | PASS | PASS | Native Product Core diagnostics smoke passed with rendered peak/rms output. |
| macOS background/foreground audio continuation | PASS | PASS | `npm run core:product:macos-app-background-smoke` passed with rendered peak/rms output. |
| macOS WebKit bridge rejects malformed payload | PASS | PASS | `npm run native:bridge:test` passed malformed payload rejection coverage. |
| iOS app/simulator builds | PASS | PASS | `npm run core:product:ios-simulator-smoke` built, installed, launched, and exited the iPhone 17 simulator app. |
| iOS Product Core starts | PASS | PASS | iOS simulator native Product Core smoke started the renderer and emitted peak/rms output. |
| iOS screen-lock/background audio continuation | PASS | PASS | `npm run core:product:ios-background-audio-smoke` exercised background/foreground and protected-data lifecycle notifications while native Product Core remained recoverable. |
| iOS interruption route change resumes safely | PASS | PASS | iOS simulator background smoke exercised route-change and interruption begin/end paths with native Product Core resume. |
| iOS protected-data state does not crash | PASS | PASS | iOS simulator background smoke observed protected-data unavailable/available counts without crash. |
| Product Core fail-closed state shown when unavailable | PASS | PASS | `npm run architecture:strict` and Product Core fallback guards passed; production web-ts fallback remains forbidden. |

## Command output

```text
npm run check:mac
PASS - Basic macOS checks passed.

npm run native:bridge:test
PASS - 7 KesshoNativeBridge tests passed, including malformed payload rejection.

swift build --package-path CapacitorMac
PASS - Build complete.

npm run core:product:ios-audio-session
PASS - Kessho iOS audio session check passed (static).

npm run core:product:ios-simulator-smoke
PASS - Kessho iOS simulator foreground smoke passed; mode=foreground sampleRate=48000.000000 bufferMs=2.666667 peak=0.002725 rms=0.001307 renderedFrames=8192 rendererStartCount=1 routeChangeCount=1 interruptionBeginCount=1 interruptionEndCount=1.

npm run core:product:ios-background-audio-smoke
PASS - Kessho iOS simulator background smoke passed; mode=background sampleRate=48000.000000 bufferMs=2.666667 peak=0.002725 rms=0.001307 renderedFrames=8192 rendererStartCount=1 routeChangeCount=1 interruptionBeginCount=1 interruptionEndCount=1 backgroundCount=1 foregroundCount=1 protectedDataUnavailableCount=1 protectedDataAvailableCount=1.

npm run core:product:macos-app-native-smoke
PASS - Kessho Capacitor macOS native Product Core diagnostics smoke passed peak=0.002724757883697748 rms=0.0013068531139962282.

npm run core:product:macos-app-background-smoke
PASS - Kessho Capacitor macOS native Product Core background smoke passed peak=0.002724757883697748 rms=0.0013068531139962282.

```

## Known issues

- Physical iOS device screen-lock/audio-route proof was not run in this local pass. The pre-sampler runtime gate is covered by iOS simulator app build/launch plus foreground/background native Product Core smoke.
