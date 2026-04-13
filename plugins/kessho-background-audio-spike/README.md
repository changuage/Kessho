# Kessho Background Audio Spike

Local Capacitor plugin used to test a native iOS background-audio path for the
wrapped Kessho web app.

This plugin is intentionally minimal and native-first:

- it owns audio with `AVAudioEngine`
- it configures `AVAudioSession` for background playback
- it exposes play/pause/status hooks to the web shell

It is a feasibility spike, not the final production bridge.
