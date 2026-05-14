# Capacitor Platform Services

## Product Boundary

Kessho Capacitor is the packaged webapp. It should use the same React UI,
state model, presets, and audio engine lane as Kessho Webapp.

Product Core enters Capacitor the same way it enters the webapp: through the
Product Core WASM/AudioWorklet path, not through the paused SwiftUI native
port.

## Active Capacitor Pieces

Web bridge contracts:

- [capacitorAudioSession.ts](/Users/panguroo/Documents/generativemusic/src/native/capacitorAudioSession.ts)
- [capacitorMidiRouting.ts](/Users/panguroo/Documents/generativemusic/src/native/capacitorMidiRouting.ts)
- [capacitorMacShell.ts](/Users/panguroo/Documents/generativemusic/src/native/capacitorMacShell.ts)

Real Capacitor shells:

- [capacitor.config.ts](/Users/panguroo/Documents/generativemusic/capacitor.config.ts)
- [ios/App/App/Info.plist](/Users/panguroo/Documents/generativemusic/ios/App/App/Info.plist)
- [CapacitorMac](/Users/panguroo/Documents/generativemusic/CapacitorMac)

Local Capacitor plugins:

- [plugins/kessho-capacitor-audio-session](/Users/panguroo/Documents/generativemusic/plugins/kessho-capacitor-audio-session)
- [plugins/kessho-capacitor-midi-routing](/Users/panguroo/Documents/generativemusic/plugins/kessho-capacitor-midi-routing)

## Audio Ownership

Default Capacitor playback should stay on the Product Core lane. The
audio-session plugin is a Capacitor platform-service bridge for
`AVAudioSession`, Now Playing metadata, and remote controls. It no longer links
or imports `KesshoNativeCore`.

Use `?audioSession=debug` only as an opt-in diagnostic for `AVAudioSession`,
Now Playing metadata, and remote controls. The legacy
`?nativeAudio=capacitor` flag is accepted as a compatibility alias, but it no
longer bypasses the Product Core audio lane. Full audio parity work belongs in:

- [cpp/KesshoCore](/Users/panguroo/Documents/generativemusic/cpp/KesshoCore)
- [src/audio/coreProductEngineHost.ts](/Users/panguroo/Documents/generativemusic/src/audio/coreProductEngineHost.ts)
- [public/worklets/kessho-core-product.worklet.js](/Users/panguroo/Documents/generativemusic/public/worklets/kessho-core-product.worklet.js)
- [public/worklets/kessho_core.wasm](/Users/panguroo/Documents/generativemusic/public/worklets/kessho_core.wasm)

The intended low-CPU iOS background-audio path is a thin native host that calls
the same Product Core C++ library from an `AVAudioEngine` render path. That
should be a thin host around the shared core, not a revival of the paused Swift
audio engine.

## MIDI Ownership

CoreMIDI is an active Capacitor platform service. The MIDI routing plugin owns
input discovery, input connections, and incoming message delivery; the webapp
owns mapping, parameter targets, state persistence, and UI.

## Paused Native Port

[KesshoNativeSwift](/Users/panguroo/Documents/generativemusic/KesshoNativeSwift) is the paused
native Swift port. It can still be useful as historical reference or fixture
source, but it should not be extended for active Capacitor parity unless the
product direction changes again.

## Device Test

Use the full device gate in
[CAPACITOR_DEVICE_VALIDATION.md](/Users/panguroo/Documents/generativemusic/docs/CAPACITOR_DEVICE_VALIDATION.md)
before treating Capacitor background playback, route changes, CPU, battery, or
hardware MIDI as release-ready.

1. Run `npm run cap:sync:ios`.
2. Open the generated project with `npm run cap:open:ios`.
3. Launch the iOS app and verify the displayed name is `Kessho Capacitor`.
4. Start playback from the web UI.
5. Open Routing, connect a MIDI input, learn a message to a target, and move
   the controller.
6. Verify that learned MIDI routes update their target parameters.
7. Verify audio-session, screen-off, and remote-control behavior on a real
   device before treating background playback as solved.
