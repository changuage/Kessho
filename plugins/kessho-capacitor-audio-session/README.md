# Kessho Capacitor Audio Session Bridge

Local Capacitor plugin used to expose iOS audio-session, Now Playing, and
remote-command services to the wrapped Kessho web app.

This plugin does not import or run the archived standalone SwiftUI audio engine.
Kessho sound generation should stay in the web/Core WASM lane for both Webapp
and Capacitor. Use `?audioSession=debug` to exercise this bridge without
switching away from the web/Core audio path.
