# Capacitor macOS App

## What exists now

Kessho now has a local macOS app bundle path that keeps the web UI and sound engine as close to the browser app as possible while adding native macOS affordances around it.

Source shell:

- [Package.swift](/Users/panguroo/Documents/generativemusic/CapacitorMac/Package.swift)
- [KesshoCapacitorMacApp.swift](/Users/panguroo/Documents/generativemusic/CapacitorMac/Sources/KesshoCapacitorMac/KesshoCapacitorMacApp.swift)
- [Info.plist](/Users/panguroo/Documents/generativemusic/CapacitorMac/Info.plist)
- [build-capacitor-mac.mjs](/Users/panguroo/Documents/generativemusic/scripts/build-capacitor-mac.mjs)

Generated app:

- `/Users/panguroo/Documents/generativemusic/build/macos/Kessho Capacitor.app`

## Commands

Build the macOS app:

```sh
npm run cap:mac:build
```

Open it:

```sh
npm run cap:mac:open
```

The open command rebuilds first, then launches `build/macos/Kessho Capacitor.app`.

The default build is a local arm64 (or x86_64) ad-hoc signed app and does not
create a distribution artifact. The architecture can be selected explicitly,
including a universal binary:

```sh
node scripts/build-capacitor-mac.mjs --arch universal
```

For direct distribution, provide release metadata and an installed Developer
ID Application certificate. The app name, bundle version, and build number are
written into the generated bundle; the source plist remains a local-build
template and the native WebKit user agent is independent of that product
naming.

```sh
MACOS_SIGNING_IDENTITY='Developer ID Application: Example, Inc. (TEAMID)' \
  npm run cap:mac:release -- \
  --version 1.2.3 \
  --build-number 42 \
  --product-name Kessho \
  --arch universal
```

The release path creates a ZIP containing the signed app, enables the hardened
runtime with a secure signing timestamp, and runs strict `codesign` and
Gatekeeper checks. Public distribution must add `--notarize`; omitting it is
only for signed preflight builds. Notarization uses a keychain profile saved by
`xcrun notarytool store-credentials`; no Apple credentials belong in the
repository:

```sh
npm run cap:mac:release -- \
  --version 1.2.3 --build-number 42 --product-name Kessho \
  --arch universal --notarize --notary-profile kessho-release
```

Validate release arguments without compiling:

```sh
npm run check:cap:mac-build
node scripts/build-capacitor-mac.mjs --release --validate \
  --version 1.2.3 --build-number 42 --product-name Kessho \
  --signing-identity 'Developer ID Application: Example, Inc. (TEAMID)'
```

## GitHub automatic updates

The macOS app uses Sparkle 2.9.2. It checks the stable `macos-updates` GitHub Release appcast once per day and downloads EdDSA-signed updates automatically. Pushing a numeric tag such as `v1.2.3` runs `.github/workflows/macos-github-update.yml`, builds a universal ad-hoc archive, signs its appcast, publishes the archive to that version's GitHub Release, and refreshes the stable feed asset.

The repository needs one Actions secret named `SPARKLE_PRIVATE_KEY`. The matching private key is stored in the local login Keychain under the Sparkle account `app.kessho.capacitor.mac`; the app contains only its public key. Export that key to a temporary file with Sparkle's `generate_keys --account app.kessho.capacitor.mac -x <temporary-file>`, set the secret from the file, and immediately delete the temporary file.

This update channel intentionally does not add Developer ID signing or notarization. Existing users can verify and install EdDSA-signed updates, but fresh downloads still have the normal Gatekeeper limitation of an ad-hoc build.

## Runtime shape

This is a native macOS SwiftUI app that hosts the production Vite build in `WKWebView`.

The app does not load the bundle through `file://`. Instead it starts a tiny localhost static server inside the process and serves the bundled `dist` files from `Contents/Resources/WebApp`. That preserves the web app's absolute asset, worklet, and WASM paths so audio parity stays much closer to the browser build.

At document start, the shell injects a small Capacitor-compatible runtime:

- `window.Capacitor.isNativePlatform()` returns `true`.
- `window.Capacitor.getPlatform()` returns `macos`.
- `window.Capacitor.Plugins.KesshoMidiRouting` is backed by native CoreMIDI.
- `window.Capacitor.Plugins.KesshoMacShell` exposes shell status and playback activity state.

The web code treats macOS as a native Capacitor shell for MIDI routing and sends the canonical Product Core snapshots, events, assets, and telemetry through the native bridge. Production audio is rendered once by the shared C++ core inside `AVAudioEngine`; the macOS shell does not construct the WebAssembly `AudioWorklet` renderer.

## Native optimizations

- `WKWebView` is packaged inside a real `.app` bundle.
- Native WebKit uses the standard persistent website data store so reloads behave like a normal installed app.
- Local loopback-only static serving keeps worklets, WASM, and hashed assets aligned with the browser build without exposing the bundle on the network.
- Bundled static assets use immutable cache headers so WebKit can reuse them without a native duplicate-memory cache.
- CoreMIDI discovery, input connection, disconnection, and live message delivery are bridged into the existing Routing page.
- Bundled Product Core audio assets are decoded directly by AVFoundation. The JSON bridge only carries decoded PCM for non-bundled/custom sources.
- Native visual telemetry is capped at 15 Hz and stops while the document is hidden; audio rendering and the native sequencer continue independently.
- Playback state is bridged into native macOS, which suppresses App Nap and idle system sleep while Kessho is playing.
- Local packaging uses an ad-hoc signature; release packaging requires a
  Developer ID Application signature with hardened runtime and a secure
  timestamp.
- The generated `.app` includes a native macOS `.icns` app icon built from the existing Kessho icon asset.
- The shell enables AirPlay media playback and WebKit inspection on supported macOS versions.
- The macOS shell participates in the Supabase-backed shared state preset library. iOS keeps the device-local native preset path, but macOS initializes the same hybrid cloud preset store as the web app and uses it for state preset load/save/import/delete.
- The shell exposes CoreAudio default-output diagnostics to the web UI, including output name, transport type, AirPlay detection, sample rate, and buffer frame size.
- The web UI can open macOS Sound settings from the Mac audio status control.
- When the current output is AirPlay, or when AirPlay performance mode is pinned on, the web runtime keeps the same Product Core audio state and parameter update cadence; the mode only pauses the visualizer and enables route-aware recovery behavior so AirPlay does not change the sound.
- While playback is active, native route, interruption, media-service reset, sleep, and wake notifications restart the `AVAudioEngine` graph when required.
- The app closes when its last window closes, matching expected small utility app behavior.

## Current caveats

- This is a Capacitor-compatible macOS shell, not an official Capacitor platform generated by `npx cap add macos`.
- Hardware MIDI routing still needs a real connected MIDI device/controller for end-to-end validation.
- Worklet-only graph capture and detailed sequencer-debug capture remain browser diagnostics; they are not part of the production macOS audio path.
- A Developer ID certificate, notarization keychain profile, and Apple account
  access are required to verify a production release end to end; local ad-hoc
  builds cannot pass Gatekeeper by design.
