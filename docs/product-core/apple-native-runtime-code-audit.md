# Apple Native Runtime Code Audit

This audit is derived from implementation source and build configuration. Existing plans, ledgers, and generated reports are not accepted as evidence that a feature works.

## Evidence Standard

A source file or method name proves only that scaffolding exists. The levels used here are:

1. `missing`: no usable implementation path.
2. `diagnostic-only`: callable by smoke or probe code, not by production playback.
3. `compiled-capability`: the implementation compiles and can be exercised in isolation.
4. `wired`: production state and lifecycle reach the implementation.
5. `measured-device`: before/after results exist on physical target hardware.

Only levels 4 and 5 support a production-readiness claim. Only level 5 supports a CPU percentage claim.

Run `npm run core:product:apple-native-code-audit` to refresh the source-derived JSON report.
Use `npm run core:product:apple-native-code-audit:strict` as a release gate; it fails until every production requirement is wired.

## Corrected Status

| Workstream | Code status | Correction |
| --- | --- | --- |
| Product Core C++ render path | Compiled capability | Native C++ render and Apple `AVAudioSourceNode` hosting exist, but the app does not use them for production playback. |
| Snapshot and event batching | Wired for web | Bounded event batches, snapshot diffs, and animation-frame state-patch coalescing already exist. The missing work is the native transport and schema contract. |
| Telemetry and visual throttling | Transport throttled, render eager | Polling is consumer-, visibility-, and rate-gated, but Product Core still rebuilds telemetry every render block. Split realtime counters from requested visual/debug snapshots. |
| Stem rendering | Always on | Stem buffers are cleared and populated during ordinary stereo playback even when recording and DAW routing are inactive. |
| Desktop output channels | Maximum by default | Desktop web and the current macOS app create a 32-channel worklet even when DAW routing is disabled. |
| Decoded asset transfer | Full copy | Every decoded channel is cloned before transfer to the worklet, adding load CPU and peak memory. |
| iOS browser background playback | Partial, best effort | The current media-element carrier and foreground recovery exist, but Audio Session playback mode and interruption-state handling are missing. Browser background execution remains non-guaranteed. |
| iOS production native routing | Diagnostic only | The plugin explicitly leaves sound generation with React/WebAudio. Native start/probe methods are diagnostics. |
| macOS production native routing | Diagnostic only | The app shell links Product Core and runs native probes, but production playback remains in the embedded web runtime. |
| Native snapshot/event integration | Missing | The bridge allowlist has no Product snapshot/event methods. The iOS renderer's snapshot and event methods are stubs. |
| Native bridge payload | Incompatible | The snapshot ABI is 151,572 bytes while current playback bridge options are capped at 8 KiB. Do not encode snapshots as ordinary bridge JSON. |
| Native control thread safety | Blocker | Snapshot/reset and asset operations mutate the render engine directly. Production wiring requires render-boundary commands and explicit asset lifetime handoff. |
| Native asset path | Compiled, not wired | Apple audio-file decode and Product asset registration exist below the app bridge. No production app API invokes them; decode is whole-file and resampling is synchronous linear interpolation. |
| Native MIDI scheduling | Collected to JS only | CoreMIDI timestamps are captured. They are not mapped to Product sample time and enqueued directly into the native renderer. |
| Native MIDI timestamp mapping | Missing | Product events support `sample_offset`, but the Apple callback discards `AudioTimeStamp`; there is no host-time-to-block-frame conversion. |
| Native event producer model | Unsafe for planned use | The C++ ring is single-producer/single-consumer. JavaScript and CoreMIDI cannot write it concurrently without serialization or an MPSC queue. |
| Background musical scheduling | Host-dependent | Harmony, chord, lead, and scheduled note behavior still runs on JavaScript timers. A native callback alone does not preserve full behavior when the WebView is suspended. |
| Recording, stems, DAW output, graph taps | Missing from native bridge | These must be designed into the native engine contract before native playback becomes the default. |
| Native output topology | Stereo master only | The C ABI has stems and graph taps, but the Apple engine exposes one fixed stereo source node. |
| Native telemetry integrity | Not measurement-ready | A 15,168-byte telemetry struct is copied every render block, native render CPU is not timed, and the iOS underrun counter never increments. |
| iOS renderer ownership | Duplicated diagnostics | The audio-session host owns one native engine and an `IOSProductAudioRenderer` that creates a second engine; lifecycle telemetry can refer to different instances. |
| Device format lifecycle | Unverified | Oversized callbacks fail and route changes do not rebuild Product Core from the actual output sample rate/block size. |
| iOS remote command authority | JavaScript-dependent | Control Center updates session state and sends a JavaScript event; it does not directly control the native renderer when the WebView is suspended. |
| macOS route observation | Missing | The shell can query CoreAudio output state but has no device/format property listener; app hiding is currently counted as a diagnostic route change. |
| Native sonic parity | Smoke only | Native tests establish finite non-silent output, not parity against the WebAudio/WASM acceptance corpus. |
| Native release-bundle filtering | Missing | iOS and macOS package the complete web build, including unreachable legacy/reference WASM files. |
| Apple CPU, spike, battery, and thermal proof | Unmeasured | Current static and simulator checks cannot establish hardware efficiency gains. |

## CPU Claim Correction

The previous percentage ranges are planning hypotheses, not audit findings. Native routing and native runtime integration overlap and must be measured as one combined playback-path comparison; adding their estimated percentages would double count shared WebAudio, worklet, copying, and scheduling overhead.

Use these measurement buckets:

| Comparison | Required result |
| --- | --- |
| WebAudio/WASM app playback vs native Product Core playback | steady audio-thread CPU, process CPU, p95/p99 render time, missed deadlines, and sonic acceptance |
| Web decode/register vs native decode/register | cold start, first-play latency, preset-load spike, peak memory, and cache-hit latency |
| JavaScript MIDI routing vs direct native MIDI scheduling | median/p95 event-to-render latency, jitter, drops, and timestamp error |
| Foreground vs background and thermal soak | battery drain, thermal state, route recovery, interruption recovery, and underruns |

## Correct Implementation Order

1. Complete the scheduler boundary: either move harmony/chord/lead scheduling into Product Core or explicitly declare those features unavailable during WebView suspension. The former is required for background parity.
2. Make native engine control real-time safe: render-boundary snapshot commands, serialized event production, deferred asset reclamation, bounded acknowledgements, and no control-thread mutation of active render state.
3. Freeze a generated binary native contract for snapshot revision/hash, bounded event batches, asset identity/lifetime, telemetry, and sample-time mapping. The 151,572-byte snapshot must not use the current 8 KiB JSON request path.
4. Add host-time-to-sample-time conversion using CoreMIDI host timestamps and `AudioTimeStamp`, preserving `sample_offset` within each render block.
5. Collapse iOS ownership to one native engine and rebuild it from actual device sample rate and safe maximum callback size after activation and route changes. Add real CoreAudio route listeners on macOS.
6. Add a native `ProductEnginePort` implementation while retaining the WebView as UI and non-realtime state authority.
7. Wire iOS and macOS production playback behind a runtime capability flag; keep WebAudio as a shadow/parity path during rollout. Native lifecycle and remote commands must operate without a JavaScript round trip.
8. Add native telemetry that measures callback duration, deadline misses, drops, sample-rate changes, thermal state, and battery impact without copying full telemetry every block.
9. Wire native assets, then recording, stems, multichannel DAW output, graph taps, and debug surfaces.
10. Run native-vs-WASM sonic corpus comparisons and physical-device CPU/latency/thermal A/B tests before enabling native playback by default or setting `supports_native_bridge` to `1`.
11. Filter unreachable legacy/reference WASM from Apple bundles now; retain `kessho_core.wasm` until the native path is the only supported Apple playback path.

The shared browser optimization work should continue in parallel, but it is no longer a blocker for beginning the native control-plane work. The remaining shared optimization work is measurement-driven C++ hot-loop work, not another generic batching or telemetry project.

## Locked Product Decisions

- Safari and Chrome on iOS receive best-effort background playback; the installed app is the guaranteed background experience.
- Hidden iOS browser playback is audio-only. Background continuity and battery efficiency take priority over control latency or visual freshness; the UI performs one authoritative resynchronization on return.
- Stereo is the default output topology. Enabling multichannel DAW output may perform a controlled audio-node restart.
- Buffer policy is automatic: prefer 128 frames for foreground wired playback and allow a safer size for Bluetooth, background, thermal pressure, or repeated deadline misses. A user override may request low latency.
- Apple apps ship their web UI and native runtime together. Snapshot/event schemas are version-locked and rejected on mismatch instead of carrying cross-version compatibility code.
- Device gates target the oldest supported iPhone, a current iPhone or iPad, Apple Silicon macOS, Bluetooth output, wired output, and a physical MIDI controller.

## iOS Browser Background Workstream

This workstream improves Chrome, Safari, and Home Screen web-app continuity without claiming native guarantees:

1. Feature-detect `navigator.audioSession`. Set its type to `playback` only after user-initiated playback, observe interruption state, and return to `auto` after stopping.
2. Keep the existing iOS `MediaStreamAudioDestinationNode` plus HTML media-element carrier behind a capability policy. A/B it against direct AudioContext output with continuity weighted above latency; additional background latency is acceptable when the carrier materially improves survival.
3. Make lifecycle recovery idempotent across Audio Session state changes, `visibilitychange`, `pagehide`, `pageshow`, `freeze`, and `resume`. Never restart transport or duplicate notes merely because the page became visible.
4. Move harmony, chord, lead, and scheduled-note behavior from JavaScript timers into Product Core so musical state continues whenever the audio render callback is permitted to run.
5. Enter an explicit audio-only hidden state: stop visual and full telemetry generation, diagnostics publication, graph taps, stem capture, meters, animation, React state publication, cache diagnostics, decode progress, and nonessential UI timers. Keep only audio rendering, Product-owned musical scheduling, interruption/lifecycle handling, and bounded health counters required for safe recovery.
6. Register Media Session metadata and actions for user-visible playback controls, while treating callbacks as opportunistic because a suspended web process may not execute JavaScript.
7. Test Safari tab, Chrome tab, and Home Screen modes separately for screen lock, app switching, Control Center, phone-call interruption, Bluetooth changes, and foreground recovery.
8. On foreground return, request one authoritative Product snapshot/telemetry refresh and rebuild UI projections from it. Do not replay hidden UI updates or accumulate an unbounded callback backlog.

Tradeoffs:

- Playback Audio Session mode can claim audio focus, interrupt or duck other audio, and behaves differently across WebKit releases. It must be feature-detected and scoped to active playback.
- The media-element carrier may increase latency and CPU through additional buffering. Keep it only when device measurements show a background-reliability benefit.
- More aggressive hidden-page throttling saves battery but exposes any musical behavior still owned by JavaScript; scheduler migration must precede full throttling.
- Audio-only background mode intentionally makes meters, playheads, diagnostics, and control projections stale. Foreground recovery must replace them atomically from Product state.
- Automatic resume can create duplicate starts or transport jumps without revision-based idempotency.
- Sustained browser background audio consumes battery and can accelerate thermal throttling even when technically permitted.
- Silent-audio loops, wake-lock abuse, and timer keepalive tricks are excluded: they waste power and do not provide a reliable WebKit contract.
