# Reference architecture

## Layer responsibilities

1. **Transport/capture.** `sysex.py` owns MIDI port discovery, the Digitone
   request message, framing, timeout handling, and validation of complete
   `F0 ... F7` messages.  It should expose a capture function that returns raw
   bytes (or a result containing raw bytes) without silently rewriting them.
2. **Raw archive.** `archive.py` writes the exact bytes to `.syx`, computes a
   content hash, and keeps capture metadata (port, track, firmware note, UTC
   time).  Raw bytes are the source of truth when a decoder is corrected.
3. **Canonical model.** `model.py` decodes known fields into a versioned,
   JSON-safe `DigitoneSound`.  Unknown bytes/fields remain represented as
   `unknown` or an opaque payload; decoding must not invent a hardware claim.
4. **Audio reference.** `audio.py` validates PCM WAVs with `wave`, lazily
   records through optional `sounddevice`, imports existing takes, and emits
   provenance-rich A/B metadata.  The deterministic test sequence is shared
   by reference capture notes and native rendering.
5. **Portable engine.** `include/` and `src/` contain the dependency-light
   C++ DSP and `digitone-render` command.  The core has no MIDI, filesystem, or
   platform audio dependency; the executable is only a reference harness.

## Artifact contract

Capture/decode workflows produce a pair with the same safe stem:

```text
<stem>.syx       exact raw SysEx bytes, including F0/F7 when supplied
<stem>.json      canonical DigitoneSound JSON
```

The canonical `provenance` object links the exact archived-input SHA-256 to the
normalized framed-message SHA-256 and records which size, declared-length, and
checksum validations ran. Relaxed research imports are therefore explicit.

An A/B run produces:

```text
<stem>_A_reference.wav
<stem>_B_engine.wav
<stem>_comparison.json
```

The comparison document is schema `digitone-ab-v1`.  It includes per-file
SHA-256 and WAV structure, PCM16 peak/RMS values, direct sample-aligned and
onset-aligned difference RMS values, a boolean comparison summary, the exact MIDI event
list and renderer command inputs, plus `provenance.canonical_sound` and (when
provided) `provenance.raw_sysex`.  Timestamps are UTC ISO-8601 values.  MIDI
velocity is retained as 0..127 in JSON and encoded as 0..1 in the native
renderer sequence token.

## Canonical JSON boundary

The renderer consumes the model's JSON directly with `--input`; it must ignore
unknown fields for forward compatibility.  The minimum useful shape is an
object with an `algorithm` number/name and operator/control fields.  The model
module owns the precise schema and should carry a schema/version field when it
changes.  CLI code treats decoder objects defensively (`to_dict`, mappings, or
JSON-safe values) so parser improvements do not require a workflow rewrite.
Parsing is strict and field-scoped: invalid/missing JSON fails the render, and
an unrelated key with a familiar name cannot override a synthesis parameter.
Raw modulation destination IDs remain in the canonical model, but the renderer
warns and leaves them unmapped until hardware calibration establishes their
meaning; callers can use the stable `Parameters.routes` API for known routes.

## Determinism and CPU

The C++ core uses fixed-size voice/operator state, explicit sample-rate and
sequence inputs, and no per-sample heap allocation.  Trigonometric lookup,
envelope coefficients, and calibration curves should be precomputed per voice
or table-driven where profiling justifies it.  Keep denormals and unbounded
polyphony out of the realtime path; the renderer may use a bounded voice count
and offline file I/O.  Do not optimize by changing Lead behavior in the parent
Kessho engine.

## Validation strategy

Python unit tests cover SysEx/archive parsing in their owning modules, the
workflow with fake MIDI/audio backends, and the compiled canonical-JSON-to-DSP
boundary. C++ tests cover all eight
topology paths, stable parameter defaults, and deterministic rendering.  WAV
goldens are useful for regressions, but should be labelled as engine goldens,
not proof of Digitone identity.
