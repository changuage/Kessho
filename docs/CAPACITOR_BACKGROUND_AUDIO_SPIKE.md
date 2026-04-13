# Capacitor Background Audio Spike

## Short answer

Yes, a Capacitor-wrapped iOS test is possible, but the viable version is not:

- wrap the current Web Audio app
- add `AVAudioSession`
- hope WKWebView keeps the audio graph alive in the background

The realistic spike is:

- keep the React/Vite app as the controller UI
- serialize `SliderState` and `dualRanges` across a Capacitor bridge
- let native iOS own playback, background audio, lock-screen controls, and interruptions

## Why a pure wrapper is the wrong test

The current web app depends on:

- `AudioContext`
- `AudioWorklet`
- browser timers
- MediaSession plus `MediaStreamDestination` tricks for iOS Safari

Those are acceptable browser workarounds, but they are still web-runtime behavior. A Capacitor shell gives you native packaging and native plugins, but it does not turn WKWebView Web Audio into an `AVAudioEngine`.

For a real screen-off test, the native side has to be the playback owner.

## Existing repo pieces that already make this plausible

The repo already has the right native building blocks:

- [AudioSessionManager.swift](/Users/panguroo/Documents/generativemusic/KesshoiOS/Kessho/Services/AudioSessionManager.swift)
- [NowPlayingManager.swift](/Users/panguroo/Documents/generativemusic/KesshoiOS/Kessho/Services/NowPlayingManager.swift)
- [AppState.swift](/Users/panguroo/Documents/generativemusic/KesshoiOS/Kessho/State/AppState.swift)
- [AudioEngine.swift](/Users/panguroo/Documents/generativemusic/KesshoiOS/Kessho/Audio/AudioEngine.swift)

That means the spike does not need to invent native audio from scratch. It can reuse the current iOS prototype as the engine behind the Capacitor bridge.

## What is in the repo now

Web bridge contract:

- [capacitorBackgroundAudio.ts](/Users/panguroo/Documents/generativemusic/src/native/capacitorBackgroundAudio.ts)

Real Capacitor shell:

- [capacitor.config.ts](/Users/panguroo/Documents/generativemusic/capacitor.config.ts)
- [ios/App/App/Info.plist](/Users/panguroo/Documents/generativemusic/ios/App/App/Info.plist)
- [ios/App/App/AppDelegate.swift](/Users/panguroo/Documents/generativemusic/ios/App/App/AppDelegate.swift)

Local Capacitor iOS plugin package:

- [plugins/kessho-background-audio-spike/package.json](/Users/panguroo/Documents/generativemusic/plugins/kessho-background-audio-spike/package.json)
- [plugins/kessho-background-audio-spike/Package.swift](/Users/panguroo/Documents/generativemusic/plugins/kessho-background-audio-spike/Package.swift)
- [plugins/kessho-background-audio-spike/ios/Sources/KesshoBackgroundAudio/KesshoBackgroundAudioPlugin.swift](/Users/panguroo/Documents/generativemusic/plugins/kessho-background-audio-spike/ios/Sources/KesshoBackgroundAudio/KesshoBackgroundAudioPlugin.swift)

App-side spike wiring:

- [App.tsx](/Users/panguroo/Documents/generativemusic/src/App.tsx)

This is now wired as a real spike path that defaults on inside the Capacitor native shell when the plugin is available. You can still force modes with `?nativeAudio=capacitor` or `?nativeAudio=web`.

## Current runtime shape

1. React UI updates local state as normal.
2. When running inside Capacitor, the bridge serializes `SliderState` and `dualRanges` to the native plugin.
3. The local Capacitor plugin decodes the bridged state into a small native model.
4. Native playback runs inside a minimal `AVAudioEngine` spike with its own `AVAudioSession`.
5. Lock-screen metadata and remote play/pause are handled through `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter`.
6. Remote play/pause commands are emitted back to JavaScript for UI sync, but native remains authoritative while in spike mode.

## Suggested bridge contract

The sketch uses these methods:

- `getStatus()`
- `syncState({ stateJson, dualRangesJson })`
- `startPlayback({ stateJson, dualRangesJson, title, artist, album })`
- `stopPlayback()`
- `setNowPlaying({ title, artist, album, isLiveStream, isPlaying, elapsedTime })`
- `setPlaybackState({ isPlaying })`
- `addListener('remoteCommand', ...)`

## What this spike can prove now

If you wire these sketch files into a real Capacitor iOS shell, the test can answer:

- Can the web UI drive a native iOS playback owner successfully through Capacitor?
- Does audio keep running with the screen locked?
- Do lock-screen play/pause commands round-trip cleanly?
- Is the bridge latency low enough for parameter changes to feel immediate?

## What it does not prove yet

- Full feature parity between the web engine and the native path
- Routing-page parity for every stem/effect
- Exact preset compatibility for every web preset
- Recording parity
- Full random-walk / morph parity

The current native spike intentionally generates a lightweight native signal derived from a few bridged fields such as `masterVolume`, `tension`, and `rootNote`. It is a feasibility harness, not the final Kessho engine.

This spike is about background-audio feasibility first, not total platform parity.

## Recommended device test

1. Run `npm run cap:sync:ios`.
2. Open the generated project with `npm run cap:open:ios`.
3. Launch the iOS app. The spike should default to native mode inside the Capacitor shell.
4. Start playback from the main transport button.
5. Lock the phone for 2 to 5 minutes.
6. Verify:
   - audio continues
   - Control Center shows metadata
   - play/pause commands work
   - headphone route changes recover cleanly

## Current caveats

- The app intentionally disables the normal web recording flow while the native spike mode is active.
- State presets in the Capacitor shell now save and load locally on-device through the preset store instead of relying on desktop-style file save dialogs or the `/presets` folder.
- This spike does not yet reuse the existing `KesshoiOS/Kessho` audio engine; it proves the Capacitor bridge and native background-audio ownership first.
- The generated iOS shell has the `audio` background mode enabled, but it still needs an actual device run in Xcode to validate screen-off behavior.

## Recommendation

This is worth testing.

The important constraint is architectural: treat Capacitor as a UI shell plus bridge, not as a way to keep the current Web Audio engine alive in the background.
