# Kessho integration boundary

The reference engine is deliberately portable and independent of Kessho's
existing Lead/FM implementation.  Integration should be an adapter, not a
copy of the CLI or a second SysEx decoder.

## Public C++ surface

The intended boundary is a small value/configuration API:

```cpp
// Host adapter pseudocode: JSON parsing stays outside the DSP core.
digitone::Parameters parameters = adapter::fromCanonicalJson(json);
digitone::Engine engine(48000.0f);
engine.setParameters(parameters);
engine.noteOn(60, 1.0f);
engine.processInterleaved(output, frames);
engine.noteOff(60);
```

Names may be wrapped for Kessho's naming conventions, but the boundary should
retain these properties: no allocation in `processInterleaved`, explicit sample
rate, deterministic state reset, bounded voice count, and per-voice effective
parameters after modulation.  A Kessho adapter can translate its event clock,
controller lanes, and output buffer into this API while leaving the engine's
calibration tables replaceable.

## Mapping policy

Map canonical fields in one adapter module:

* algorithm/topology and operator ratios map directly;
* grouped B1/B2 and HARM remain named fields rather than flattened guesses;
* feedback and X/Y carrier mix map to normalized engine controls;
* envelopes, amp/filter scaffolding, LFOs, and controller routes map to
  per-voice effective parameters at note start and at modulation updates;
* fields not decoded or not measured remain at documented defaults and are
  surfaced in diagnostics.

The adapter must not mutate the existing Lead parameter IDs or serialization.
If Kessho needs a richer host abstraction, add a translation layer at the
boundary and keep the standalone engine's API stable.

## CPU/realtime rules

Construct and parse `DigitoneSound` off the audio thread.  Precompute envelope
coefficients and calibration-table pointers when a voice is created.  Reuse
voice state and scratch buffers; avoid JSON, mutexes, filesystem calls, and
dynamic allocation while rendering.  Measure polyphony and table lookup cost
on each target before changing the Lead path.
