# Kessho Capacitor Audio Session Bridge

Local Capacitor plugin used to expose iOS audio-session, Now Playing, and
remote-command services to the wrapped Kessho web app.

This plugin does not import or run the archived standalone SwiftUI audio engine.
Production sound generation stays in the web/Core WASM lane until native Product
Core device tests pass and the native capability flag is flipped.

Use `?audioSession=debug` to exercise platform session services without
switching away from the web/Core audio path. Use
`?audioSession=debug&nativeProduct=diagnostic` only for native Product Core
diagnostics; it returns scalar output probe values and can start a diagnostic
AVAudioEngine path, but it does not send realtime audio buffers through JS or the
Capacitor bridge.
