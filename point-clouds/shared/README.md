# Point Clouds website bridge

`kessho-site-bridge.js` is the small, reusable adapter used by the Point
Clouds alternatives. It does not implement an audio engine. The hidden
`engineFrame` must load the application’s actual Product Core runtime, and all
audio and telemetry remain authoritative there.

```js
const controller = window.PointCloudsKessho.create({
  engineFrame: document.querySelector('#kessho-engine'),
  presetId: 'string-waves',
  // Website-specific policy belongs here; it is not a Product Core default.
  overrides: { reverbQuality: 'lite' },
  onStatus: ({ phase, error }) => console.log(phase, error),
  onTelemetry: (telemetry) => draw(telemetry.rms, telemetry.stemPeaks),
});

await controller.boot();
await controller.start();
controller.setMorph(0.5);
await controller.stop();
controller.destroy();
```

The controller reports `booting`, `ready`, `loading`, `playing`, `stopping`,
and `failed`. It only reports `playing` after the Product Core bridge has
resolved `start()` and its status proves a running lifecycle and transport (and
an explicitly published running AudioContext state when available). Telemetry
is sampled at roughly 16.7 Hz, paused while the page is hidden, and stopped on
`destroy()`. Each normalized telemetry sample contains the complete engine
snapshot as `raw`, output `rms`/`peak`, deltas plus derived `onset`/`transient`,
transport beat/bar/phrase positions, phrase progress, real sequencer current
steps and event/pulse counters, active voices/sources, and worklet stem peaks
(`stemPeaks`/`stemPeakValues` preserve the Product Core array;
`stemPeaksByName`/`stems` expose only Product Core's named pad/lead/fx/master
fields).

## Visual input architecture

`window.PointCloudsKessho.inputLibrary` is the versioned routing-to-visual
dictionary. Its entries are parent families rather than routing children:
Pads, Leads, Samples, Drums, Earth, Effects, Granular, Delays, Degrade,
Reverb, Master, and Transport. For example, Pads owns Pad 1 + Pad 2, Earth
owns Waves + Water + Insects + Nature, and Delays owns Delay A + Delay B.
Each entry declares its Product Core provider, supported signal vocabulary,
and two or three suggested visual reactions.

Every telemetry sample exposes the corresponding live frame at
`telemetry.visualInputs`:

```js
const frame = controller.getSnapshot().telemetry.visualInputs;
const pads = frame.channels.pads;
if (pads.available) {
  drawPadVolume(pads.level, pads.onset);
}
```

The shared signal vocabulary is `level`, `peak`, `onset`, `transient`,
`activity`, `phase`, and `pulse`. `available: true` means the named Product
Core provider is authoritative even when all values are zero. An unavailable
channel is explicitly marked `availability: 'unavailable'`; callers must not
replace it with Master or the aggregate Effects stem. Source parents and the
aggregate Effects bus use the low-cost Product Core stem telemetry. Exact
Granular, Delay, and Reverb return channels activate only when their own
return field or a valid graph-tap peak is published. Degrade stays unavailable
until Product Core publishes its exact return. This lets future engine probes
be added at the provider boundary without changing visualizer code.

## Direct `file://` opens

The original page and both alternatives can be opened directly from disk and
still run the actual Product Core runtime. On a file-origin page the bridge
first boots the generated Product Core assets in the same top-level document, avoiding an
opaque iframe boundary. If that parent bootstrap is unavailable, it loads the
generated regular-file engine document in `point-clouds/shared/embedded/`
(with an opaque `about:srcdoc` fallback only when that document cannot be
resolved):

- `kessho-engine.html` is the local engine document; using a regular file
  avoids browsers rejecting sibling `file://` scripts from an opaque srcdoc
  origin.
- `kessho-engine.iife.js` is the bundled React/Product Core application.
- `kessho-product-core-assets.js` carries the exact Product Core worklet and
  WASM bytes, the local String Waves sample, and the resolved String Waves
  preset snapshot. It intercepts only the synthetic sample/manifest paths;
  there is no Supabase/API dependency in this bundle.
- Each Point Clouds page also contains a generated, guarded inline copy of the
  bridge. It runs only when a file-origin browser refuses the external shared
  script, so a missing local script cannot turn the transport into an early
  controller-null click while HTTP pages retain one shared source.
- `public/presets/StringWaves.json` is the canonical materialized V2
  SavedPreset snapshot used by the regular offline fallback. The generator
  reads that asset and embeds an identical copy in
  `kessho-product-core-assets.js`; the generated bundle is the only source
  used by direct `file://` playback.

The opaque frame cannot load Blob subresources in Chromium, so the runtime uses
data URLs for both the worklet module and the WASM fallback URL. The actual WASM
binary is transferred directly to Product Core when available. The regular HTTP
iframe path and cloud-backed preset behavior are unchanged. Regenerate the
committed artifacts after changing Product Core assets or the snapshot:

```sh
npm run point-clouds:embedded:generate
```

The bridge treats Product Core lifecycle and telemetry as authoritative; it
never substitutes an oscillator or synthetic telemetry. The bridge regression
suite covers stale final telemetry after a completed Product Core stop:

```sh
npm run test:point-clouds-bridge
```

Chromium direct-file playback is verified for the original page and both
alternatives, including
click start, Space stop/start, click stop, non-zero Product Core telemetry, and
zero Supabase requests. Playwright WebKit boots the embedded frame but its
bundled WebKit build rejects this OGG soundscape in `decodeAudioData`
(`EncodingError: Decoding failed`); this is a browser codec limitation rather
than an engine/module-loading failure.

For HTTP(S) development, run `npm run dev` and open the generated Point Clouds
URL. The iframe path is resolved from this shared script, so the same bridge
works for both alternatives and the original page.
