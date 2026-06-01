# iOS MIDI and Live-Play Gap Audit

Generated for the iOS parity track.

## Scope

This audit covers iOS-only MIDI, touch learn, audio-session, native render preparation, latency instrumentation, and lifecycle evidence gaps. Shared MIDI profile, shared MIDI Learn state, shared Product live-note contracts, and macOS parity remain outside this ownership track.

## Current iOS App Shell

- iOS app project: `ios/App/App.xcodeproj/project.pbxproj`
- iOS app delegate: `ios/App/App/AppDelegate.swift`
- Capacitor config copied into the app: `ios/App/App/capacitor.config.json`
- Web bundle hosted by Capacitor: `ios/App/App/public`
- iOS Info.plist: `ios/App/App/Info.plist`
- SwiftPM package shell: `ios/App/CapApp-SPM/Package.swift`

## Plugin Registration Points

- MIDI routing plugin package: `plugins/kessho-capacitor-midi-routing`
- MIDI routing iOS source: `plugins/kessho-capacitor-midi-routing/ios/Sources/KesshoMIDIRouting/KesshoMidiRoutingPlugin.swift`
- Audio-session plugin package: `plugins/kessho-capacitor-audio-session`
- Audio-session iOS source: `plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/KesshoAudioSessionPlugin.swift`
- iOS app SwiftPM package links the managed audio-session plugin from `ios/App/CapApp-SPM/Package.swift`.

## Info.plist and Capabilities

- `UIBackgroundModes` includes `audio`.
- No Bluetooth privacy string is currently declared. CoreMIDI USB input does not require a Bluetooth prompt, but Bluetooth MIDI discovery UI may require a privacy description if CoreBluetooth scanning is added.
- Supported orientations include iPhone portrait plus landscape, and all iPad orientations.
- No native bridge capability flag is enabled by this work.

## Existing MIDI State

- The iOS MIDI plugin already uses CoreMIDI.
- Existing functions cover start, stop, refresh inputs, connect, disconnect, disconnect all, set connected inputs, status, and message listeners.
- Existing normalized messages include kind, status, channel, data bytes, raw bytes, endpoint ID, endpoint name, and note-on velocity-zero normalization.

## iOS MIDI Gaps Addressed in This Track

- Endpoint metadata now includes display name, transport, Bluetooth/network flags, and persistent identity.
- Runtime hotplug bookkeeping records hotplug events and reconnect attempts.
- Saved input reconnect remains owned by shared TypeScript profile state; native code now supports runtime desired-connection reconciliation by unique ID and fallback identity.
- MIDI messages include host-time timestamp fields for native latency instrumentation.
- A throttled `midiActivity` event is available for UI monitors without reducing the raw `midiMessage` path used by learn/routing.

## Existing Audio Session and Native Render State

- The audio-session plugin already configures `AVAudioSession`, Now Playing metadata, remote commands, route-change notifications, interruption notifications, and media-services reset notifications.
- It already exposes native Product Core diagnostic renderer controls through `KesshoAppleProductAudioEngine`.
- The native bridge remains diagnostic/prep only; production capability stays disabled.

## iOS Audio Gaps Addressed in This Track

- `IOSAudioSessionCoordinator` centralizes requested sample rate, requested buffer duration, actual device values, route summary, silent-switch policy, and app lifecycle counters.
- `IOSProductAudioRenderer` provides a Swift-side prep wrapper for configure/start/stop/interruption/route-change telemetry without sending realtime audio buffers over the JS bridge.
- `IOSRealtimeEventQueue` scaffolds a fixed-capacity native event queue for live-note latency preparation.

## iOS Touch Learn Gaps Addressed in This Track

- `iosTouchLearnGuards.ts` requires captured MIDI plus real slider value-change drag before assignment.
- The guard rejects tap-only and scroll-biased gestures.
- `MidiMappingBottomSheet.tsx` provides an iOS bottom-sheet editor surface for the shared MIDI mapping UI to consume.

## Evidence Rows Still Pending

These rows require device execution before release claims:

- iOS native foreground render
- screen lock while audio runs
- app background while audio runs
- Control Center / Now Playing interaction
- route change
- interruption begin/end
- Bluetooth MIDI disconnect/reconnect
- USB MIDI hotplug
- low power mode observation
- sustained thermal/battery observation
- iPhone portrait layout
- iPad landscape layout

## Guardrails

- `supports_native_bridge` remains disabled.
- `supportsNativeBridge` remains disabled.
- No realtime audio buffers cross the Capacitor JavaScript bridge.
- MIDI Learn, CC movement, and live note-on/off must not use full Product snapshots.
- Physical iOS evidence is not claimed by static or simulator reports.
