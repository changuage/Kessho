# Dynamics Page Implementation Plan

## Goal

Add a new advanced **Dynamics** page that owns three related but separate output-shaping modules:

- **Sidechain**: trigger-derived ducking for selected non-key sources.
- **Character**: Abyss/Shallow-style movement, resonance, damping, width, and envelope feel.
- **Degrade**: tape/lofi media damage such as amount, wear, wow, flutter, noise, filtering, internal damage saturation, and corrosion.
- **Saturation**: explicit master bus tape/tube color usable with Character, Degrade, both, or neither.
- **End Chain**: final glue compression before the existing safety limiter.

The initial implementation must default to neutral bypass values so existing presets sound unchanged.

## Decisions

- The tab name is **Dynamics**.
- Sidechain and end-chain compression are separate modules on the same page.
- Sidechain target amount is a clean 0-100% duck blend, not an additive send.
- Reverb is excluded from sidechain targets for v1.
- Sidechain detection uses drum trigger events for v1 instead of audio analysis.
- Any two drum engines can act as sidechain keys.
- Character modes are movement personalities only; Degenerate/Generation/VHS identities live in Degrade presets.
- Master tape/tube saturation is its own module, not hidden inside Degrade.
- Tape/character processing is global in v1, with naming that allows a future routable character/tape bus.
- End-chain order is character/degrade into compressor into the existing limiter.
- Presets store all new params, but random-walk animation is not enabled by default.

## Planned Signal Flow

```text
Targetable dry sources
  -> direct gain
  -> sidechain target gain -> sidechain duck bus
  -> master character path

Non-targeted sources and reverb return
  -> master character path

master character path
  -> character/degrade engine
  -> optional master saturation
  -> end-chain compressor
  -> existing limiter
  -> destination
```

For each sidechain target:

```text
directGain = 1 - targetAmount
duckSendGain = targetAmount
```

This avoids parallel gain buildup and makes target amount mean "how much this source ducks."

## Sidechain Module

### Key Sources

Two selectable keys:

- `off`
- `sub`
- `kick`
- `click`
- `beepHi`
- `beepLo`
- `noise`
- `membrane`

Each key has an independent weight.

### Targets

V1 targets:

- Pad 1
- Pad 2
- Lead 1
- Lead 2
- Piano
- Granular
- Delay A
- Delay B

Reverb stays out of the target set for v1.

### Controls

- Enable
- Key A
- Key B
- Key A Weight
- Key B Weight
- Mix
- Threshold
- Ratio
- Knee
- Attack
- Hold
- Release
- Makeup
- Mix
- Curve
- Detector HPF
- Detector LPF

V1 can implement trigger-shaped ducking with compressor-like controls. If overlap/sample accuracy becomes a problem, move the envelope stage into a tiny AudioWorklet.

## Character And Degrade Module

### Modes

- `clean`
- `abyssWater`
- `shallowWater`

### Character Controls

- FX On/Off
- Mix
- Age
- Resonance
- Stereo
- Env Follow
- Depth
- Rate
- Damp

### Degrade Controls

- FX On/Off
- Amount
- Wear
- Generation
- Alias
- Wow
- Flutter
- Drift
- Tone
- HP
- LP
- Noise
- Clip
- Corrosion

### ZOIA Reference Notes

`Abyss Water`:

- Compact patch: 37 modules, 45 cables, meta CPU 45.5.
- Core path: input -> stereo spread/moving path -> cascaded lowpass filters -> balance -> compressor -> OD/distortion -> output.
- Core controls: rate, LPG, resonance, damp, mix, frequency bias, depth, volume.
- Character: smoothed random movement, envelope-reactive lowpass, resonant lowpass pairs, compression into soft drive.

`Degenerate Gain`:

- V3 patch: 166 modules, 320 cables, meta CPU 32.6.
- Core path: input -> stereo spread -> aliaser -> wet VCA -> HP filters -> LP filters -> output, with dry VCA in parallel.
- Core controls: wow, flutter, wet level, generation/alias amount, HP, LP, corrosion, dry volume, noise level, resonance.
- Modulation is built from repeated per-parameter blocks: selected source -> bipolar depth -> target parameter.

Kessho should borrow the control philosophy and sound families, not recreate the full ZOIA topology.

### Sonic Quality Passes

- Character env follow now drives an envelope-reactive lowpass opening instead of being a placeholder.
- Character stereo now uses a dual-delay spread with pan offsets for shallow-water style width.
- Character now adds allpass phase color and wet-path compression/makeup: Shallow Water presets lean into wide modulated phase-chorus movement, while Abyss Water presets lean into resonant LPG/compressed bloom.
- Character and Degrade share smoothed random drift so movement is less purely periodic.
- Degrade wear/corrosion now adds dropout-style gain instability and a tape-body bump before filtering/saturation.
- Degrade now includes a light AudioWorklet stage for true sample-hold downsampling and bit-depth quantization, driven by Generation/Alias controls and saved as L1 Degrade preset data.
- Degrade gain staging was trimmed after listening feedback: factory presets now use lower drive/noise/corrosion defaults, and the worklet damage curve keeps aliasing musical until pushed intentionally.
- Master saturation has been split into its own L1 Dynamics Saturation module so Character can use tape/tube bus color without enabling Degrade.

## Saturation Module

Uses the existing master waveshaper/tone stage, but with Dynamics-owned state and presets.

Controls:

- FX On/Off
- Mode
- Drive
- Tone

## End Chain Module

Use a native `DynamicsCompressorNode` plus makeup/mix gains.

Controls:

- Enable
- Threshold
- Knee
- Ratio
- Attack
- Release
- Makeup
- Mix

The existing limiter remains last.

## Implementation Order

1. Add this plan document. Done.
2. Add neutral state keys, serialization keys, and quantization ranges. Done.
3. Add the Dynamics tab and a page shell. Done.
4. Move/display existing master saturation controls on Dynamics. Done.
5. Add end-chain compressor nodes in neutral bypass mode. Done.
6. Add character/degrade graph and mode mapping. Done.
7. Add sidechain target routing and trigger-derived envelope. Done for dry pad, lead, piano, granular return, Delay A, and Delay B targets. Reverb remains excluded.
8. Align the Dynamics page styling with Granular/Reverb aesthetics. Done.
9. Add help text and preset migration polish. Help text done; Dynamics L3 source preset scope, L1 module engine preset scopes, save/load dropdowns, factory presets, and Supabase V2 state/source-child graph coverage done.
10. Run type/build checks and browser verification. Type/build and preset dedupe checks done; browser verification pending.
