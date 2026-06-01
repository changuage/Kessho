# iOS MIDI and Live-Play Parity Plan

## Target

The iOS app should use the shared MIDI Learn, routing profile, and Product event contracts while adapting the experience for touch and iOS native lifecycle constraints.

## Native MIDI

- Use CoreMIDI for USB-C, Lightning interface, Bluetooth MIDI, virtual, and network sources where iOS exposes them.
- Keep user routing profiles in shared TypeScript storage.
- Native MIDI emits normalized `KesshoMidiMessage` objects with endpoint metadata and host-time timestamps.
- Raw message listeners remain available for learn/routing. UI activity uses the throttled `midiActivity` stream.
- Hotplug refresh records events and attempts runtime reconnect by unique ID, then persistent endpoint identity/name/manufacturer fallback.

## Touch Learn

- Tap MIDI Learn in shared UI.
- Move a hardware control.
- Drag a mappable slider.
- iOS assignment requires a nonzero value-changing slider drag to avoid accidental scroll assignment.
- Tapping a MIDI chip or long-pressing a slider should open the bottom sheet editor.
- The learn bar should use safe-area padding on iPhone and iPad.

## Audio Session

- Use `AVAudioSessionCategoryPlayback` to avoid silent-switch surprises for a musical instrument.
- Request 48 kHz and a 128-frame preferred buffer for low-latency preparation.
- Report actual sample rate, actual buffer duration, actual frame count, route summary, and lifecycle counters.
- Handle route changes, interruptions, media-services reset, foreground/background transitions, and protected-data changes.
- Do not send realtime audio buffers over the JS bridge.

## Native Render Preparation

The intended native path is:

```txt
iOS CoreMIDI callback
  -> IOSRealtimeEventQueue
  -> native audio render callback
  -> Product Core render
  -> audio output
```

JavaScript remains responsible for UI commands, profile edits, mapping edits, telemetry snapshots, and diagnostics only.

## Latency Evidence

Latency reports must include evidence mode:

- `static` for source/report checks only
- `simulator` for simulator runs
- `physical-controller` only when a real iOS device and MIDI controller are used

Release claims require physical-device rows with tester, date, device, and iOS version.

## Validation

- `npm run core:product:ios-midi-routing-smoke`
- `npm run core:product:ios-midi-learn-ui`
- `npm run core:product:ios-audio-session`
- `npm run core:product:ios-live-note-latency`
- `npm run core:product:ios-background-audio-evidence`
- `npm run core:product:ios-midi-live-play-e2e`
- `npm run core:product:native-capability-signoff`

Expected native-capability status remains `ready=false` until physical evidence passes.
