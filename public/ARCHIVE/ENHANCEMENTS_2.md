# Kessho Enhancements — Phase 2

This document tracks three Phase 2 items: Piano Sampler, Dual Delay Buses, and an FX Routing
Matrix with Delay B–Granular linkage. Piano is explicitly deferred until source samples are ready.
Dual Delay is now live on the web app as a shared Delay A / Delay B system with a dedicated
Delay tab and shared source sends. The next active slice is the Routing Matrix rollout, which
now ships as its own Routing page against the real grouped buses that exist today rather than the
earlier idealized per-voice plan.
Designed against the live preset hierarchy (L1–L5) and current signal flow as of March 2026.

---

## 1. Piano Sampler — Synth Page Source

**Status**: Deferred until sample set is ready

### Overview
Multi-sampled piano loaded as a source on the Synth page alongside Pad 1, Pad 2, Lead 1, and
Lead 2. Uses two WAV files per note (short + long) for natural variation. Routable from both the
lead random timing sequencer and the synth Euclidean sequencer. Piano is part of the "Synth"
engine group (tab name may evolve to "Melody" or similar — TBD). Snowflake UI is unchanged;
piano shares the synth prong.

### Sample Preparation

**Source files**: 60+ notes recorded as WAV (two variants per note: short + long).

**Recommended conversion pipeline**:
```bash
# Downsample: 44.1kHz → 22.05kHz mono, 16-bit
# OGG Vorbis at quality 3 (~96kbps) — excellent for ambient piano
for f in *.wav; do
  ffmpeg -i "$f" -ar 22050 -ac 1 -c:a libvorbis -q:a 3 "${f%.wav}.ogg"
done
```

| Format | Per-note (est.) | 60 notes × 2 variants | Notes |
|--------|-----------------|----------------------|-------|
| WAV 44.1kHz stereo 16-bit | ~200KB | ~24 MB | Too large |
| WAV 22.05kHz mono 16-bit | ~50KB | ~6 MB | Acceptable fallback |
| OGG 22.05kHz mono q3 | ~15KB | ~1.8 MB | Recommended |
| OGG 22.05kHz mono q2 | ~10KB | ~1.2 MB | Aggressive, still fine for ambient |

**Recommendation**: Ship OGG at 22.05kHz mono, quality 3. Total ~1.8MB for 120 files.
Keep WAV as fallback for older Safari. 22.05kHz is sufficient — piano samples will be
pitch-shifted ±1 semitone max and the ambient context masks any high-frequency loss.
Mono is fine — stereo imaging comes from per-note random panning.

### Sample Organization
```
public/samples/piano/
  C2_short.ogg    C2_long.ogg
  Cs2_short.ogg   Cs2_long.ogg
  D2_short.ogg    D2_long.ogg
  ...
  C6_short.ogg    C6_long.ogg
```

**Coverage**: 60+ chromatic notes (roughly C2–C6). Between-note pitches interpolated via
`playbackRate` (max ±1 semitone stretch to avoid artifacts).

**Loading**: Preload all buffers on first piano enable into a
`Map<number, { short: AudioBuffer, long: AudioBuffer }>` keyed by MIDI note.

### Signal Chain (Per Note)
```
AudioBufferSourceNode → GainNode (ADSR envelope) → Piano Bus GainNode
  ├── pianoLevelGain → synthBus → masterGain (dry path)
  ├── pianoReverbSendGain → reverbInputBus
  ├── pianoDelayASendGain → delayBusA
  ├── pianoDelayBSendGain → delayBusB
  └── pianoGranularSendGain → granularFxInputGain
```

### ADSR Envelope
Applied via `GainNode.gain` scheduling per note:
- **Attack**: `linearRampToValueAtTime` — 5ms–500ms (default 10ms, prevents clicks)
- **Decay**: `exponentialRampToValueAtTime` — 10ms–2s
- **Sustain**: Hold level 0–1 (duration = sample length minus A+D+R, or hold time for long variant)
- **Release**: `exponentialRampToValueAtTime` — 50ms–4s (default 1.5s for ambient tail)

Short vs long sample selection: generative logic picks per-note. Weight controlled by
`pianoArticulation` parameter (0 = always short, 1 = always long, 0.5 = random).

### Note Triggering

**Random Timing Mode (Lead Sequencer)**:
Piano appears as a new source option in the lead random timing sequencer alongside lead1/lead2.
When `leadRandomEnabled: true` and source is `'piano'`, `playLeadNote()` calls `playPianoNote()`
with the same note selection logic (scale-aware, octave range, density).

**Euclidean Mode (Synth Euclidean Sequencer)**:
Piano appears as a new source option in the `synthEuclid[1-4]Source` dropdown:
```typescript
synthEuclid1Source: 'lead' | 'lead1' | 'lead2' | 'piano'
                  | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
```
When a Euclidean lane hits with source `'piano'`, it calls `playPianoNote()` with the lane's
note range, level, and probability settings.

### Per-Note Expression
- **Velocity**: Random gain variation (controlled by pianoVelocityMin/Max range)
- **Detune**: Optional ±5–15 cents per note for subtle warmth (`AudioBufferSourceNode.detune`)
- **Pan**: Slight random stereo spread per note (±0.1–0.3)

### Preset Hierarchy Placement

| Level | Scope | Parameters |
|-------|-------|------------|
| **L1** | `piano` | `pianoAttack`, `pianoDecay`, `pianoSustain`, `pianoRelease`, `pianoArticulation`, `pianoDetune`, `pianoStereoSpread` (7 params) |
| **L2** | `pianoKit` | `pianoEnabled`, `pianoOctave`, `pianoOctaveRange`, `pianoVelocityMin`, `pianoVelocityMax` (5 params) |
| **L4** | `global` | `pianoLevel`, `pianoReverbSend`, `pianoDelayASend`, `pianoDelayBSend`, `pianoGranularSend` (5 params) |

No new L3 scope — piano lives within the `synth` L3 source page.

### State Parameters (state.ts additions)
```typescript
// Piano Sampler
pianoEnabled: boolean;            // on/off toggle (default false)
pianoLevel: number;               // 0..1 master output (default 0.5)
pianoOctave: number;              // -2..+2 octave offset (default 0)
pianoOctaveRange: number;         // 1..4 span for random notes (default 2)
pianoAttack: number;              // 0.005..0.5 seconds (default 0.01)
pianoDecay: number;               // 0.01..2 seconds (default 0.2)
pianoSustain: number;             // 0..1 level (default 0.7)
pianoRelease: number;             // 0.05..4 seconds (default 1.5)
pianoArticulation: number;        // 0..1 (0=short, 1=long, default 0.5)
pianoDetune: number;              // 0..15 cents random detune (default 8)
pianoStereoSpread: number;        // 0..1 random pan spread (default 0.2)
pianoVelocityMin: number;         // 0..1 min velocity (default 0.3)
pianoVelocityMax: number;         // 0..1 max velocity (default 0.9)
pianoReverbSend: number;          // 0..1 (default 0.4)
pianoDelayASend: number;          // 0..1 (default 0)
pianoDelayBSend: number;          // 0..1 (default 0.3)
pianoGranularSend: number;        // 0..1 (default 0)
```

### Engine Implementation (engine.ts additions)

New private members:
```typescript
private pianoBuffers: Map<number, { short: AudioBuffer, long: AudioBuffer }> | null = null;
private pianoBus: GainNode | null = null;
private pianoLevelGain: GainNode | null = null;
private pianoReverbSendGain: GainNode | null = null;
private pianoDelayASendGain: GainNode | null = null;
private pianoDelayBSendGain: GainNode | null = null;
private pianoGranularSendGain: GainNode | null = null;
```

New methods:
- `loadPianoSamples()` — fetch + decode all OGG pairs into buffer map
- `playPianoNote(freq, velocity, time)` — pick short/long, pitch-shift to exact freq, schedule ADSR
- `initPianoGraph()` — create bus + send gain nodes, wire to master/reverb/delay/granular

### UI — Synth Tab Addition

Piano section appears as a collapsible panel on the Synth tab, below Pad 2:

```
┌──────────────────────────────────────┐
│ ∿ Synth                              │
├──────────────────────────────────────┤
│ ▼ Pad 1 Preset Morph                │
│ ▼ Pad 2 Preset Morph                │
│ ▼ Piano ◻ [Enable]                  │  ← NEW
│   ┌────────────────────────────────┐ │
│   │ Level ─────────●──────── 50%   │ │
│   │ Octave     [-1] [0] [+1] [+2] │ │
│   │ Range      [1] [2] [3] [4]    │ │
│   │ Articulation ──●──────── 50%   │ │  (short ←→ long)
│   │ ┌─ Envelope ─────────────────┐ │ │
│   │ │ A ●── 10ms   D ●── 200ms  │ │ │
│   │ │ S ●── 70%    R ●── 1.5s   │ │ │
│   │ └───────────────────────────┘ │ │
│   │ Detune ─────●──────── 8¢      │ │
│   │ Stereo ─────●──────── 0.2     │ │
│   │ Velocity [0.3 ──●──── 0.9]    │ │  (dual-range slider)
│   └────────────────────────────────┘ │
│ ▼ Lead 1 Preset Morph                │
│ ▼ Lead 2 Preset Morph                │
│ ▼ Euclidean (source: piano added)    │
└──────────────────────────────────────┘
```

**Styling**: Same panel background (`rgba(255,255,255,0.05)`), border, slider styles as existing
Synth tab. Piano icon suggestion: `♬` (inline with enable toggle).

---

## 2. Dual Delay Buses — Shared Delay Engine Rollout

**Status**: Implemented on web (current rollout)

### Overview
Two shared delay buses with **different architectures** will eventually be accessible from a new
**Delay** tab:

- **Delay A** — shared lead-style stereo delay bus. The final target is a more universal
  experimental bus, but the first implementation slice starts from the tested lead-delay topology
  so Lead can migrate without a big sonic regression.
- **Delay B** — shared 8-tap multi-tap delay engine extracted from the current granular
  clocked-space path.

The end-state still replaces the three existing delay implementations: lead ping-pong delay,
drum delay (JS + WASM), and granular 8-tap delay. The rollout is now incremental:

1. **Slice 1** — extract reusable Delay A / Delay B engines in `engine.ts`, route Lead through
   shared Delay A, and route Granular clocked space through shared Delay B while keeping the
   current Lead and Granular controls as the frontend.
2. **Slice 2** — migrate drums and other engines onto shared sends, add dedicated Delay page
   controls, and introduce the routing matrix.
3. **Slice 3** — finish preset-scope migration (`delayA`, `delayB`) and expose Delay B linkage
   controls explicitly.

Current implementation note: Lead, Granular, Drums, Pads, Waves, Water, and Insects now all
have live shared-bus routing into Delay A and/or Delay B, and there is now a dedicated Delay page
that centralizes Delay A, Delay B, and their cross-feeds while keeping the existing per-engine
controls in place during migration. Drum timing/tone only front Delay A when Lead delay is not
actively owning that bus yet. Granular preset loads now also have an explicit
`delayBGranularLinked` toggle, so Delay B can either follow granular preset changes or stay
independent.

Delay B remains conceptually linked to Granular in the user experience even after extraction:
the DSP is now shared and the Delay page exposes it centrally, but the current Granular
"Space / Clocked Space" surface still mirrors that behavior during rollout.

### Why Remove the Existing Delays

| Problem | Current State | After |
|---------|--------------|-------|
| **3 separate delay systems** | Lead (JS ping-pong), Drum (JS + WASM), Granular (JS 8-tap) | 2 shared buses |
| **Piano/water/insects can't use delay** | No send path exists | Every engine gets sends |
| **Delays skip each other** | Lead delay can't feed granular delay | A→B cross-feed + B→Granular link |
| **3× parameter sets to manage** | 28 delay params across 3 scopes | 20 params in 2 scopes |
| **WASM drum delay duplicates JS** | Delay exists in both WASM and DrumSynth.ts | Removed from both |
| **8-tap delay trapped in granular** | Only granular output can use it | Any engine can send to Delay B |
| **No unified delay presets** | Each delay has ad-hoc params | L3 source presets per bus |

### Deprecation Checklist — Lead Delay Removal

**State params to remove** (7 params, L1 scope `leadDelay`):
- `leadDelayEnabled`, `leadDelayTime`, `leadDelayFeedback`, `leadDelayMix`
- `leadDelaySpread`, `leadDelayFilter`, `leadDelaySend`

**L4 global param to remove** (1):
- `leadDelayReverbSend` (replaced by `delayAReverbSend` / `delayBReverbSend`)

**Engine.ts nodes to remove** (~13 connections):
- `leadDelayL`, `leadDelayR` (DelayNode pair)
- `leadDelayFeedbackL`, `leadDelayFeedbackR` (GainNode pair)
- `leadMerger` (ChannelMergerNode)
- `leadDelayMix` (GainNode)
- `leadFilter` (BiquadFilterNode — delay-related)
- `leadDelayReverbSend` (GainNode)

**Replacement**: Lead output → `lead1DelayASendGain` / `lead1DelayBSendGain` → shared buses.

**UI changes**: Remove delay sliders from Lead tab. Add delay send amounts to routing matrix.

**Legacy migration**: `normalizePresetForWeb()` silently drops old `leadDelay*` params from
loaded presets. No crash — unknown keys are already ignored by the loader.

### Deprecation Checklist — Drum Delay Removal

**State params to remove** (14 params, L3 scope `drums`):
- `drumDelayEnabled`, `drumDelayNoteL`, `drumDelayNoteR`
- `drumDelayFeedback`, `drumDelayMix`, `drumDelayFilter`
- Per-voice sends: `drumSubDelaySend`, `drumKickDelaySend`, `drumClickDelaySend`,
  `drumBeepHiDelaySend`, `drumBeepLoDelaySend`, `drumNoiseDelaySend`, `drumMembraneDelaySend`

**DrumSynth.ts changes**:
- Remove `createDelayEffect()` method and all JS-side delay nodes
- Remove `updateDelayParams()` method
- Remove 8 node references (delay L/R, feedback L/R, filter, mix, merger, output)

**WASM C++ changes** (`wasm/drum/kessho_drum.cpp`):
- Remove `g_delay` global struct and stereo ping-pong DSP
- Remove 6 API functions: `drum_set_delay_enabled/time_l/time_r/feedback/filter/mix`
- Remove `g_delay_sends[7]` array and per-voice send logic
- Remove delay processing from `drum_process_block()`
- Drum WASM output becomes dry-only; delay applied via JS-side shared bus sends

**Worklet changes**: Remove delay-related message handling in drum worklet.

**Replacement**: Drum output → `drumDelayASendGain` / `drumDelayBSendGain` → shared buses.
Per-voice drum delay sends are simplified to a single `drumDelayASend` / `drumDelayBSend`
at L4 scope (whole drum bus, not per-voice).

Interim shipping behavior: JS drums still preserve their per-voice send trims into shared Delay A.
When the WASM drum path is active, those trims are approximated onto a whole-bus send until the
full routing matrix / explicit drum delay send UI lands.
Drums also now have a whole-bus `drumDelayBSend` route into shared Delay B. Delay B is still
voiced from Granular's Clocked Space controls, but it can already wake from direct drum feed or
Delay A cross-feed even when Granular's own send into Delay B is off. The new Delay tab now
surfaces that shared-bus routing directly, without removing the existing source pages yet.

**iOS impact**: `AudioEngine.swift` — remove `setupDrumDelay()`, lead delay node setup.

### Granular 8-Tap Delay Extraction

The granular multi-tap delay is still promoted into a shared Delay Bus B engine, but the product
decision changed: the DSP is extracted first, while the Granular page keeps the current controls
and ownership of "Clocked Space" during the rollout. In other words, Delay B becomes a shared
engine immediately, and the Delay page now exposes that bus centrally, but Granular UX stays
linked as a mirrored frontend until the later preset-scope migration is finished.

**State params to remove** (8 params, L3 scope `granular`):
- `granularDelayEnabled`, `granularDelayActivity`, `granularDelayRepeats`
- `granularDelayTime`, `granularDelayFilter`, `granularDelayVibrato`
- `granularDelayMix`

**L4 global param to remove** (1):
- `granularDelayReverbSend` (replaced by `delayBReverbSend`)

**Engine.ts nodes to remove** (~30 nodes):
- `granularDelayInputNode`, `granularDelayOutputGain`, `granularDelayDirectGain`
- `granularDelayReverbSendGain`, `granularDelayFeedbackGain`, `granularDelayToneFilter`
- `granularDelaySendGain`
- 8× `granularDelayTapNodes` (DelayNode)
- 8× `granularDelayTapGains` (GainNode)
- 8× `granularDelayTapPanners` (StereoPannerNode)
- 8× `granularDelayVibratoOscs` (OscillatorNode)
- 8× `granularDelayVibratoDepths` (GainNode)

**Constants to move** (not remove — reuse in Delay B):
- `TAP_SUBDIVISIONS`, `TAP_PANS`, `TAP_VIBRATO_RATES`, `MAX_VIBRATO_DEPTH`
- `TAP_ACTIVITY_CONFIG`, `computeTapGain()`
- `DELAY_NOTE_DIVISIONS`, `delayNoteToSeconds()` (already shared)

**Replacement**: Granular output → shared Delay Bus B input send.
Near-term UI: the Granular tab still shows Clocked Space controls, but they now drive shared
Delay B rather than a Granular-only internal delay network.

**Legacy preset migration**:
```typescript
// Map old granular delay params → delay B
if (typeof raw.granularDelayEnabled === 'boolean' && raw.granularDelayEnabled) {
  normalized.delayBEnabled ??= true;
}
if (typeof raw.granularDelayActivity === 'number') {
  normalized.delayBActivity ??= raw.granularDelayActivity;
}
if (typeof raw.granularDelayRepeats === 'number') {
  normalized.delayBFeedback ??= raw.granularDelayRepeats;
}
if (typeof raw.granularDelayTime === 'string') {
  normalized.delayBNoteDiv ??= raw.granularDelayTime;
}
if (typeof raw.granularDelayFilter === 'number') {
  normalized.delayBFilterFreq ??= 200 * Math.pow(40, raw.granularDelayFilter); // 0-1 → 200-8000Hz
}
if (typeof raw.granularDelayVibrato === 'number') {
  normalized.delayBVibrato ??= raw.granularDelayVibrato;
}
if (typeof raw.granularDelayMix === 'number') {
  normalized.delayBMix ??= raw.granularDelayMix;
}
```

### 2.1 Architecture — Delay Bus A (Single-Line)

```
                    ┌──────────────────────────────────────────────────┐
                    │              DELAY BUS A                         │
                    │                                                  │
 delayAInput ──►   │  inputGain → DelayNode (max 5s) → filterNode ─┐ │
 (sum of sends)    │                    ▲                    │      │ │
                   │                    │                    ▼      │ │
                   │                    └── feedbackGain ◄──────────┘ │
                   │                                                  │
                   │              LFO (OscNode) → modGain → delayTime │
                   │              WaveShaperNode (soft clip in fbk)   │
                   │                                                  │
                   │                        outputGain ───────────────┼──► reverbInputBus
                   │                              │                   │
                   │                        directGain ───────────────┼──► masterGain
                   │                              │                   │
                   │                        delayBSendGain ───────────┼──► delayBInput (cross-feed)
                   └──────────────────────────────────────────────────┘
```

### 2.1b Architecture — Delay Bus B (Multi-Tap)

```
                    ┌────────────────────────────────────────────────────────────┐
                    │              DELAY BUS B (8-Tap Multi-Tap)                  │
                    │                                                            │
 delayBInput ──►   │  inputGain ──┬─► Tap1 (1.0×) → Gain1 → Pan1 ──┐           │
 (sum of sends     │              ├─► Tap2 (0.5×) → Gain2 → Pan2 ──┤           │
  + A cross-feed)  │              ├─► Tap3 (0.75×)→ Gain3 → Pan3 ──┤           │
                   │              ├─► Tap4 (0.25×)→ Gain4 → Pan4 ──┤           │
                   │              ├─► Tap5 (⅓×)  → Gain5 → Pan5 ──┤  output   │
                   │              ├─► Tap6 (⅙×)  → Gain6 → Pan6 ──┤  Gain     │
                   │              ├─► Tap7 (⅜×)  → Gain7 → Pan7 ──┤           │
                   │              └─► Tap8 (⅛×)  → Gain8 → Pan8 ──┘           │
                   │                                                            │
                   │  Activity macro (0-1) progressively enables taps 1→8       │
                   │  Per-tap vibrato LFOs (0.6-1.3Hz) → each tap delayTime     │
                   │                                                            │
                   │  outputGain → feedbackGain → toneFilter → back to input    │
                   │  (feedback auto-normalized by sum of active tap gains)      │
                   │                                                            │
                   │                        outputGain ─────────────────────────┼──► reverbInputBus
                   │                              │                             │
                   │                        directGain ─────────────────────────┼──► masterGain
                   │                              │                             │
                   │                        granularSendGain ───────────────────┼──► granularFxInput
                   └────────────────────────────────────────────────────────────┘
```

**Key differences from Delay A**:
- 8 parallel delay taps at musical subdivisions instead of 1 delay line
- Per-tap stereo panning (alternating L/R: -0.7, 0.7, -0.5, 0.5, -0.8, 0.8, -0.3, 0.3)
- Per-tap vibrato at different LFO rates (0.6–1.3Hz, max 8ms depth) — creates chorus effect
- Activity macro progressively activates taps 1→8 with smooth crossfades
- Feedback auto-normalized by total active tap gain — prevents runaway at high activity
- Always BPM-synced (note division based, no free time mode)
- No saturation/waveshaper (tamed by normalization instead)
- No selectable filter type (always lowpass in feedback, matching current behavior)

Cross-feed: A→B allowed (A's output feeds B's input). B→A blocked.

### 2.2 Signal Chain Detail — Delay A

1. **Input Gain** (`delayAInputGain`) — sum of all engine sends, gain=1.0
2. **DelayNode** — `maxDelayTime: 5.0`, controllable 0.01–5.0s (free time or note-synced)
3. **BiquadFilterNode** in feedback path — LP/BP/HP selectable, 200–12kHz sweep
4. **Feedback GainNode** — 0.0–0.95 range (soft limit)
5. **LFO** — `OscillatorNode` → `GainNode` → `delayTime` AudioParam
   - Rate: 0.05–5Hz, Depth: 0–50ms
   - Waveform: sine / triangle
6. **WaveShaperNode** — sigmoid soft clipper in feedback loop (tames runaway)
7. **Output GainNode** — wet level
8. **Direct to master** — optional dry monitoring of delay output
9. **Reverb send** — delay output feeds `reverbInputBus`
10. **Cross-feed** — Delay A output optionally feeds Delay B input (A→B only)
11. **DynamicsCompressorNode** after output — limiter at -6dB for safety

### 2.2b Signal Chain Detail — Delay B

1. **Input Gain** (`delayBInputGain`) — sum of all engine sends + A cross-feed
2. **8× DelayNode** — `maxDelayTime: 5.0`, each at `baseTime × TAP_SUBDIVISIONS[i]`
3. **8× GainNode** — per-tap level, controlled by Activity macro via `computeTapGain()`
4. **8× StereoPannerNode** — alternating L/R panning per tap
5. **8× Vibrato LFO** — `OscillatorNode` (0.6–1.3Hz) → `GainNode` (0–8ms) → tap `delayTime`
6. **Output GainNode** — sum of all tap outputs
7. **Feedback path** — outputGain → feedbackGain (auto-normalized) → toneFilter (LPF) → inputGain
8. **Direct to master** — wet output
9. **Reverb send** — delay output feeds `reverbInputBus`
10. **Granular send** — delay output optionally feeds `granularFxInputGain` (linkage)
11. **DynamicsCompressorNode** after output — limiter at -6dB for safety

### 2.3 Per-Engine Send Routing

Every sound engine gets two new send gain nodes:

```
Engine Output ──┬── dry path (existing)
                ├── reverbSend (existing)
                ├── granularSend (existing where applicable)
                ├── delayASendGain ──► delayAInput    ← NEW
                └── delayBSendGain ──► delayBInput    ← NEW
```

| Engine | Delay A Send | Delay B Send |
|--------|-------------|-------------|
| Pads (grouped bus) | `padDelayASend` | `padDelayBSend` |
| Lead 1 | `lead1DelayASend` | `lead1DelayBSend` |
| Lead 2 | `lead2DelayASend` | `lead2DelayBSend` |
| Drums (whole bus) | `drumDelayASend` | `drumDelayBSend` |
| Granular | `granularDelayASend` | `granularDelayBSend` |
| Waves (Ocean) | `oceanDelayASend` | `oceanDelayBSend` |
| Water | `waterDelayASend` | `waterDelayBSend` |
| Insects (grouped wet bus) | `insDelayASend` | `insDelayBSend` |
| Piano | Deferred until sample set lands | Deferred until sample set lands |

**Current web total**: 16 new L4 send parameters + `delayAToBSend`, `delayAGranularSend`,
and `delayBGranularSend`.

### 2.4 Delay B ↔ Granular Linkage

**Concept**: Delay B is linked to Granular by default. When linked:

1. **Loading a Granular L3 preset also loads a Delay B preset** — the granular preset JSON
   includes an optional `linkedDelayBPreset` field:
   ```json
   {
     "type": "source",
     "source": "granular",
     "scope": "granular",
     "name": "Shimmer Wash",
     "versions": [{
       "v": 1,
       "data": {
         "granularEnabled": true,
         "granularDryWet": 0.6,
         "...": "...",
         "linkedDelayBPreset": "Dub Echo",
         "linkedDelayBGranularSend": 0.4
       }
     }]
   }
   ```

2. **The linked granular preset sets the Delay B → Granular send level**
   (`delayBGranularSend`) as part of its data. This means the granular preset author can
   tune how much of Delay B's wet output feeds back into the granular buffer.

3. **Linkage can be toggled off** via `delayBGranularLinked: boolean` (default `true`).
   When unlinked:
   - Loading a granular preset does NOT touch Delay B settings
   - `delayBGranularSend` is independently controllable
   - Delay B operates fully independently

Current rollout note: the dedicated Delay B preset files do not exist yet, so the linked
`delayBGranularSend` value is currently inferred from each granular preset's own clocked-space
mix/repeat balance. The explicit toggle and routing behavior are live now; the file-level preset
split still comes later.

**Signal flow when linked**:
```
Any Engine → Delay B → delayBGranularSend → granularFxInputGain → granular buffer
                                                                         │
                                                                    granular output
                                                                         │
                                                               ┌─────────┤
                                                               ▼         ▼
                                                          masterGain  reverbInputBus
```

Delay B repeats feed into the granular buffer, where they get sliced, scattered, and
re-pitched. This creates cascading textural evolution — delay echoes become granular
source material.

**Linkage state params**:
```typescript
delayBGranularLinked: boolean;       // default true — loading granular preset also loads delay B
delayBGranularSend: number;          // 0..1 — delay B wet → granular input (default 0.3)
delayAGranularSend: number;          // 0..1 — delay A wet → granular input (default 0, independent)
```

**ParamRegistry placement**:
- `delayBGranularLinked` → L3 scope `granular` (it's a granular behavior setting)
- `delayBGranularSend` → L4 scope `global` (cross-page routing)
- `delayAGranularSend` → L4 scope `global` (cross-page routing)

### 2.5 Preset Hierarchy Placement

| Level | Scope | Description | Param Count |
|-------|-------|-------------|-------------|
| **L3** | `delayA` | Delay A engine (single-line) | 12 params |
| **L3** | `delayB` | Delay B engine (multi-tap) | 8 params |
| **L3** | `granular` | `delayBGranularLinked` added | +1 param |
| **L4** | `global` | Per-engine sends + cross-feed + delay→granular | 25 params |

**L3 Delay A Scope Parameters** (single-line delay):
```typescript
// L3 scope: 'delayA'
delayAEnabled: boolean;              // on/off (default false)
delayATime: number;                  // 0.01..5.0 seconds (default 0.25)
delayASync: boolean;                 // true = sync to BPM (default true)
delayANoteDiv: string;               // '1/4', '1/8', '1/8d', etc. (default '1/4')
delayAFeedback: number;              // 0..0.95 (default 0.35)
delayAFilterFreq: number;            // 200..12000 Hz (default 5000)
delayAFilterType: string;            // 'lowpass'|'bandpass'|'highpass' (default 'lowpass')
delayAModRate: number;               // 0.05..5.0 Hz (default 0)
delayAModDepth: number;              // 0..1 maps to 0-50ms (default 0)
delayASaturation: number;            // 0..1 waveshaper drive (default 0.1)
delayAMix: number;                   // 0..1 direct output (default 0.3)
delayAReverbSend: number;            // 0..1 delay wet → reverb (default 0.3)
```

**L3 Delay B Scope Parameters** (multi-tap delay):
```typescript
// L3 scope: 'delayB'
delayBEnabled: boolean;              // on/off (default false)
delayBNoteDiv: string;               // '1/4', '1/8', '1/8d', etc. (default '1/4') — always BPM-synced
delayBActivity: number;              // 0..1 — progressive tap activation macro (default 0.3)
delayBFeedback: number;              // 0..0.85 — auto-normalized by tap count (default 0.3)
delayBFilterFreq: number;            // 200..8000 Hz — LPF in feedback loop (default 2200)
delayBVibrato: number;               // 0..1 — per-tap delay time modulation, max 8ms (default 0)
delayBMix: number;                   // 0..1 — direct output level (default 0.3)
delayBReverbSend: number;            // 0..1 — wet → reverb (default 0.4)
```

**Note**: Delay B has **8 params** (not 12) because:
- No free time mode — always BPM-synced via note division (no `delayBTime`, `delayBSync`)
- No filter type selector — always lowpass (matching proven granular delay behavior)
- No saturation — feedback tamed by auto-normalization instead of waveshaper
- Activity macro replaces LFO rate/depth — per-tap vibrato rates are hardcoded constants

### 2.6 Defaults (Suggested Characters)

**Delay A** — Single-line (Empress-style, experimental):
| Parameter | Default |
|-----------|---------|
| Time | 0.25s (1/4 note synced) |
| Sync | true |
| Feedback | 0.35 |
| Filter Freq | 5000 Hz |
| Filter Type | lowpass |
| Mod Rate | 0 Hz (off) |
| Mod Depth | 0 |
| Saturation | 0.1 |
| Mix | 0.3 |
| Reverb Send | 0.3 |

**Delay B** — Multi-tap (polyrhythmic constellation):
| Parameter | Default |
|-----------|---------|
| Note Division | 1/4 |
| Activity | 0.3 (taps 1-2 active) |
| Feedback | 0.3 (auto-normalized) |
| Filter Freq | 2200 Hz |
| Vibrato | 0 |
| Mix | 0.3 |
| Reverb Send | 0.4 |

Delay A: clean single echo for rhythmic/experimental effects. Turn up mod rate + depth
for tape warble, push feedback for self-oscillation.
Delay B: polyrhythmic multi-tap delay. Turn up Activity to progressively reveal more
subdivisions. Turn up Vibrato for detuned chorale effect. Linked to granular so its
output becomes granular source material.

### 2.7 Tab Structure Update

```
Global (◎) | Synth (∿) | Drums (⋮⋮) | Earth (≈) | Granular (⊞) | Delay (◇) | Reverb (◈)
```

New `AdvancedTab` type:
```typescript
type AdvancedTab = 'global' | 'synth' | 'drums' | 'earth' | 'granular' | 'delay' | 'reverb';
```

### 2.8 UI — Delay Tab Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ◇ Delay                                                     │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                   │
│   ┌─ A ─┐  ┌─ B ─┐     │  Mobile: A/B sub-tab toggle       │
│   │ active│  │ dim  │     │  Desktop: side-by-side            │
│   └──────┘  └──────┘     │                                   │
│                          │                                   │
├──────────────────────────┴──────────────────────────────────┤
│                                                              │
│  ┌─── Delay A ── ◻ [Enable] ────────────────────────────┐   │
│  │                                                        │  │
│  │  Time ────────────●──────────── 250ms                 │  │
│  │  [Sync ◻] Note: [1/4 ▾]                              │  │
│  │  Feedback ────────●──────────── 35%                   │  │
│  │  Filter ──────────●──────────── 5.0kHz  [LP ▾]       │  │
│  │  Mod Rate ────────●──────────── 0 Hz                  │  │
│  │  Mod Depth ───────●──────────── 0%                    │  │
│  │  Saturation ──────●──────────── 10%                   │  │
│  │  Mix ─────────────●──────────── 30%                   │  │
│  │  Reverb Send ─────●──────────── 30%                   │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── Delay B (Multi-Tap) ── ◻ [Enable] ────────────────┐  │
│  │                                                        │  │
│  │  Note Div ────────[1/4 ▾]  (1/1 to 1/32)             │  │
│  │  Activity ────────●──────────── 30%                   │  │
│  │   ○○○○○○○○  (tap activity indicator: lit = active)    │  │
│  │  Feedback ────────●──────────── 30%  (auto-normalized)│  │
│  │  Filter ──────────●──────────── 2.2kHz                │  │
│  │  Vibrato ─────────●──────────── 0%                    │  │
│  │  Mix ─────────────●──────────── 30%                   │  │
│  │  Reverb Send ─────●──────────── 40%                   │  │
│  │                                                        │  │
│  │  ┌─ Granular Link ── ◻ [Linked] ─────────────────┐   │  │
│  │  │  When linked, loading a Granular preset also    │   │  │
│  │  │  loads the associated Delay B preset.           │   │  │
│  │  │  Granular Send ───●──────────── 30%             │   │  │
│  │  └────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── Cross-Feed ────────────────────────────────────────┐  │
│  │  A → B ───────────●──────────── 0%                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── Delay Presets ─────────────────────────────────────┐  │
│  │  A: [Clean Echo ▾]        B: [Dub Echo ▾]            │  │
│  │  [Save A] [Save B]                                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.9 Factory Delay Presets

**Delay A presets** (loaded from `public/presets/DelayA/`):

| Name | Character | Key Settings |
|------|-----------|-------------|
| **Clean Echo** | Transparent repeats | Mod=0, Sat=0, Filter=8kHz |
| **Tape Slap** | Short, warm, wobble | Time=120ms, Mod=0.8Hz/0.4, Filter=3kHz |
| **Dub Echo** | Dark, filtered, long | Feedback=0.7, Filter=1.5kHz, Sat=0.4 |
| **Shimmer Cascade** | High-feedback, bright | Feedback=0.85, Filter=8kHz, Mod=1.5Hz |
| **Warped Tape** | Experimental, washy | Time=2.5s, Mod=2Hz/0.8, Sat=0.6, Reverb=0.9 |

**Delay B presets** (loaded from `public/presets/DelayB/`):

| Name | Character | Key Settings |
|------|-----------|-------------|
| **Sparse Pulse** | Minimal, 1-2 taps | Activity=0.1, Filter=4kHz, Vibrato=0 |
| **Poly Echo** | Balanced, 4-5 taps | Activity=0.5, Filter=3kHz, Vibrato=0.2 |
| **Dense Constellation** | Full 8 taps | Activity=0.95, Filter=2kHz, Vibrato=0.4 |
| **Chorus Cloud** | Heavy vibrato, wide | Activity=0.6, Filter=5kHz, Vibrato=0.8 |
| **Granular Mist** | Linked to granular | Activity=0.7, Feedback=0.6, GranularSend=0.5 |

### 2.10 Key Implementation Notes

**Soft Clipping Curve** (WaveShaperNode):
```typescript
function makeSoftClipCurve(drive: number, samples = 256): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (2 * i / (samples - 1)) - 1;
    curve[i] = Math.tanh(x * (1 + drive * 4)); // drive 0-1 → gain 1-5
  }
  return curve;
}
```

**BPM Sync**: Delay time recalculated on `synthEuclidBaseBPM` or `granularEuclidBaseBPM` change:
```typescript
const baseTime = delayNoteToSeconds(state.delayANoteDiv, bpm);
this.delayANode.delayTime.setTargetAtTime(baseTime, now, 0.05);
```

**Legacy preset migration** (`normalizePresetForWeb()`):
```typescript
// Map old lead delay params → delay A sends
if (typeof raw.leadDelayEnabled === 'boolean' && raw.leadDelayEnabled) {
  normalized.lead1DelayASend ??= raw.leadDelaySend ?? 0.3;
}
// Map old drum delay enabled → drum delay A send
if (typeof raw.drumDelayEnabled === 'boolean' && raw.drumDelayEnabled) {
  normalized.drumDelayASend ??= raw.drumDelayMix ?? 0.3;
}
// Map old granular delay → delay B (see Granular Delay Removal section for full mapping)
// Old params silently dropped — no crash
```

---

## 3. FX Routing Matrix

**Status**: In Progress (v1 live on Routing tab)

### Overview
A visual routing matrix showing the currently routable sound engines as rows and the shared FX
destinations as columns. Each cell is a send amount (0–100%). The current implementation is a
direct-manipulation matrix on the dedicated Routing tab. Each row now has a first-column **Level**
cell, and every editable cell uses a relative drag gesture: press, then drag up or down for fine
control without being limited to the cell height. Column headers are also draggable and act as
relative trims for the full column. All matrix values map to existing L4 `global` scope parameters
— the matrix is a **UI layer over existing state**, not a new abstraction.

Current rollout note: the matrix now reflects the real shared buses that exist in the engine
today. Pad 1 and Pad 2 are shown as separate rows for direct editing, and their Delay A / Delay B
sends are now truly split in the engine. Pad reverb is still shared at the pad-bus level. Insects
remain grouped into one wet row, and Piano stays deferred until the sampler is implemented.

### Matrix Structure

**Rows** (Sound Engines / Sources):
| Row | Engine |
|-----|--------|
| 1 | Pad 1 |
| 2 | Pad 2 |
| 3 | Lead 1 |
| 4 | Lead 2 |
| 5 | Drums |
| 6 | Granular |
| 7 | Waves |
| 8 | Water |
| 9 | Insects |
| 10 | Delay A Out |
| 11 | Delay B Out |

**Columns** (FX Destinations):
| Col | Destination |
|-----|-------------|
| 1 | Level |
| 2 | Delay A |
| 3 | Delay B |
| 4 | Granular |
| 5 | Reverb |

**Special cells**:
- Delay A → Delay A: self
- Delay B → Delay B: self
- Delay B → Delay A: blocked (prevents infinite loop)
- Delay A → Delay B: allowed (cross-feed via `delayAToBSend`)
- Delay A/B → Granular: allowed (delay output feeds granular buffer)
- Granular → Granular: blocked (self)

### Parameter Mapping

```
                    │ Level           │ Delay A         │ Delay B         │ Granular           │ Reverb                │
────────────────────┼─────────────────┼─────────────────┼─────────────────┼────────────────────┼───────────────────────┤
 Pad 1              │ synthLevel      │ pad1DelayASend  │ pad1DelayBSend  │ granularPad1Send   │ pad1ReverbSend        │
 Pad 2              │ pad2Level       │ pad2DelayASend  │ pad2DelayBSend  │ granularPad2Send   │ pad2ReverbSend        │
 Lead 1             │ lead1Level      │ lead1DelayASend │ lead1DelayBSend │ granularLead1Send  │ lead1ReverbSend       │
 Lead 2             │ lead2Level      │ lead2DelayASend │ lead2DelayBSend │ granularLead2Send  │ lead2ReverbSend       │
 Drums              │ drumLevel       │ drumDelayASend  │ drumDelayBSend  │ granularDrumSend   │ drumReverbSend        │
 Granular           │ granularLevel   │ granularDelayASend │ granularDelayBSend │ ▬ (self)      │ granularReverbSend    │
 Waves              │ oceanSampleLevel│ oceanDelayASend │ oceanDelayBSend │ granularWavesSend  │ oceanReverbSend       │
 Water              │ waterLevel      │ waterDelayASend │ waterDelayBSend │ granularWaterSend  │ waterReverbSend       │
 Insects            │ insectsLevel    │ insDelayASend   │ insDelayBSend   │ granularInsectsSend│ insectsReverbSend     │
 Delay A Out        │ leadDelayMix    │ ▬ (self)        │ delayAToBSend   │ delayAGranularSend │ leadDelayReverbSend   │
 Delay B Out        │ granularDelayMix│ ✕ (blocked)     │ ▬ (self)        │ delayBGranularSend │ granularDelayReverbSend │
```

**Existing params reused**: `lead1ReverbSend`, `lead2ReverbSend`, `drumReverbSend`,
`granularReverbSend`, `waterReverbSend`, `insectsReverbSend`, `oceanReverbSend`,
`granularPad1Send`, `granularPad2Send`, `granularLead1Send`,
`granularLead2Send`, `granularDrumSend`, `granularWavesSend`, `granularWaterSend`,
`granularInsectsSend`.

Current rollout note: the Delay A / Delay B reverb-column cells still drive the existing
frontend-owned bus return params (`leadDelayReverbSend` and `granularDelayReverbSend`) until the
future `delayA` / `delayB` preset-scope split is finished.

`*` = Pad 1 and Pad 2 currently mirror the same shared pad-bus reverb send parameter.

### Where the Matrix Lives (UI)

**Primary location**: Dedicated **Routing** tab in the advanced editor.
The matrix still edits L4 params, but it now has its own page so the send grid can stay cleaner
and easier to test while Delay continues to own bus voicing.

**Contextual view on Delay tab**: The Delay tab shows simplified bus ownership/feed status and
the delay-to-delay / delay-to-granular crossfeeds, while the full per-source matrix lives on the
Routing page.

### UI — Matrix Visual Design

```
┌──────────────────────────────────────────────────────────────────┐
│ ▼ Routing Matrix                                                 │
│                                                                  │
│             Level    Delay A    Delay B    Granular    Reverb      │
│           ┌──────┐  ┌──────┐   ┌──────┐  ┌──────┐   ┌──────┐      │
│  Pad 1    │ ● 60 │  │ ◐ 40 │   │ ◐ 25 │  │ ◐ 35 │   │ ● 60 │      │
│  Pad 2    │ ● 55 │  │ ◐ 18 │   │ ◐ 45 │  │ ◐ 20 │   │ ● 60 │      │
│  Lead 1   │ ◐ 25 │  │  ○   │   │  ○   │  │ ◐ 20 │   │ ● 70 │      │
│  Lead 2   │ ◐ 30 │  │  ○   │   │ ◐ 40 │  │  ○   │   │ ● 80 │      │
│  Drums    │ ◐ 50 │  │ ◐ 50 │   │  ○   │  │  ○   │   │ ● 30 │      │
│  Granular │ ● 45 │  │  ○   │   │ ◐ 30 │  │  ▬   │   │ ● 45 │      │
│  Waves    │  ○   │  │  ○   │   │  ○   │  │ ◐ 40 │   │ ● 55 │      │
│  Water    │ ● 50 │  │  ○   │   │  ○   │  │ ◐ 15 │   │ ● 20 │      │
│  Insects  │ ● 60 │  │  ○   │   │  ○   │  │  ○   │   │ ● 25 │      │
│  Delay A  │ ◐ 35 │  │  ▬   │   │ ◐ 30 │  │  ○   │   │ ● 40 │      │
│  Delay B  │ ◐ 30 │  │  ✕   │   │  ▬   │  │ ◐ 30 │   │ ● 70 │      │
│           └──────┘  └──────┘   └──────┘  └──────┘   └──────┘      │
│                                                                  │
│  ○ = 0%    ◐ = partial    ● = active    ▬ = self    ✕ = blocked │
└──────────────────────────────────────────────────────────────────┘
```

### Cell Interaction

**Press and drag a cell** → Moves that cell relatively for finer control, with pointer capture so
the gesture can continue beyond the cell bounds.
**Press and drag a column header** → Moves the whole column up or down relative to its current
values.

**Color coding**:
- Fill: flat accent wash + bottom meter, scaled by send amount
- Blocked cells: dark with `✕`, not interactive
- Self cells: dark with `▬`, not interactive
- Active cells (>0): show percentage label

**Compact mode** (mobile): The current v1 keeps the same grid and direct drag interaction with
horizontal scrolling rather than a separate row-expansion UI.

### Matrix Styling
```typescript
const matrixStyles = {
  container: {
    display: 'grid',
    gridTemplateColumns: '100px repeat(4, 1fr)',
    gap: '2px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    padding: '8px',
    border: '1px solid rgba(100, 150, 200, 0.2)',
  },
  cell: {
    height: '36px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    cursor: 'ns-resize',
    transition: 'background 0.15s',
  },
  cellActive: {
    background: 'rgba(165, 196, 212, 0.1)',
    border: '1px solid rgba(165, 196, 212, 0.25)',
  },
  cellBlocked: {
    background: 'rgba(50, 50, 50, 0.5)',
    cursor: 'not-allowed',
    color: 'rgba(255, 255, 255, 0.2)',
  },
  rowLabel: {
    fontSize: '0.8rem',
    color: '#a5c4d4',
    textAlign: 'right' as const,
    paddingRight: '8px',
  },
  colHeader: {
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: '#7a9aaf',
    textAlign: 'center' as const,
  },
};
```

### Preset Hierarchy Impact

The routing matrix changes **zero** preset hierarchy structure — it's a read/write view over
L4 `global` scope parameters. Matrix cell values save/load as part of State Presets (L4).

| Action | Effect |
|--------|--------|
| Load State Preset (L4) | All matrix values update |
| Load Delay A Preset (L3) | Only delay A engine params change — matrix sends unaffected |
| Load Granular Preset (L3) | Granular params + linked Delay B preset (if linked) |
| Load Reverb Preset (L3) | Only reverb engine params change |
| Journey Morph (L5) | All matrix values morph between journey node states |

---

## 4. Full Signal Flow — Updated Architecture

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Pad 1     │ │   Pad 2     │ │  Lead 1/2   │ │   Piano     │ │   Drums     │
│  (6 voices) │ │  (6 voices) │ │ (4op FM×2)  │ │ (sampler)   │ │ (7 voices)  │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       │               │               │               │               │
       ├─dry──┐        ├─dry──┐        ├─dry──┐        ├─dry──┐        ├─dry──┐
       ├─dA───┤        ├─dA───┤        ├─dA───┤        ├─dA───┤        ├─dA───┤
       ├─dB───┤        ├─dB───┤        ├─dB───┤        ├─dB───┤        ├─dB───┤
       ├─gr───┤        ├─gr───┤        ├─gr───┤        ├─gr───┤        ├─gr───┤
       └─rv───┘        └─rv───┘        └─rv───┘        └─rv───┘        └─rv───┘
              │               │               │               │               │
              ▼               ▼               ▼               ▼               ▼

┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Water     │ │ Insects 1/2 │ │   Waves     │
│  (WASM)     │ │   (WASM)    │ │  (sample)   │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       ├─dry/dA/dB/gr/rv               ├─dry/dA/dB/gr/rv
       ▼                               ▼

  ═══════════════════════════════════════════════════════════════════
  dA sends ──► ┌─── DELAY A ───┐                    dry sends
               │ delay→filter  │                         │
               │ →fbk→softclip │                         │
               │ LFO→mod       │                         │
               └───────┬───────┘                         │
                  ┌────┤                                 │
                  │    ├──► A→B cross-feed                │
                  │    │                                  │
  dB sends ──► ┌─┼─── DELAY B ───┐                      │
               │ │  delay→filter  │                      │
               │ │  →fbk→softclip │                      │
               │ │  LFO→mod       │                      │
               │ └───────┬────────┘                      │
               │    ┌────┤                               │
               │    │    ├──► B→Granular (linked)         │
               │    │    │                                │
  gr sends ──► ┌────┼────┼─ GRANULAR FX ──┐              │
               │    │    │  (WASM, 4 voice │              │
               │    │    │   grain engine) │              │
               └────┼────┼────────┬────────┘              │
                    │    │        │                        │
                    ▼    ▼        ▼                        ▼
               ┌──────────────────────────────────────────────┐
               │              REVERB INPUT BUS                │
               │         (sum of all rv sends +               │
               │          delay A/B reverb sends +            │
               │          granular reverb send)               │
               └────────────────────┬─────────────────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │   REVERB (WASM)  │
                          │   FDN + Shimmer  │
                          │ + Spectral Freeze│
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │   MASTER OUTPUT  │
                          │   (Limiter/Comp) │
                          └──────────────────┘
  ═══════════════════════════════════════════════════════════════════
```

**dA** = Delay A send, **dB** = Delay B send, **gr** = granular send, **rv** = reverb send

---

## 5. Implementation File Impact

| File | Changes |
|------|---------|
| `src/ui/state.ts` | Add piano + delay + send params; remove lead/drum delay params |
| `src/presets/ParamRegistry.ts` | Register new scopes (`piano`, `pianoKit`, `delayA`, `delayB`); remove `leadDelay` scope; remove drum delay from `drums` scope; remove granular delay from `granular` scope |
| `src/audio/engine.ts` | Piano sampler init/play; delay bus A/B creation + wiring; remove lead delay nodes; remove granular delay nodes (promote to Delay B); add per-engine send gains |
| `src/audio/drumSynth.ts` | Remove `createDelayEffect()`, `updateDelayParams()`, delay node refs |
| `wasm/drum/kessho_drum.cpp` | Remove `g_delay` struct, 6 delay API functions, per-voice send array |
| `src/App.tsx` | Add `'delay'` and `'routing'` tabs; add piano UI section on Synth tab |
| `src/ui/global/RoutingMatrix.tsx` | Matrix grid React component used by the dedicated Routing page |
| `src/ui/routing/RoutingPage.tsx` | **New file** — routing tab content |
| `src/ui/delay/DelayPage.tsx` | **New file** — delay tab content (A/B panels + cross-feed + link toggle) |
| `src/audio/pianoSampler.ts` | **New file** — sample loading, buffer management, note playback |
| `public/presets/DelayA/` | **New directory** — factory delay A presets (JSON) |
| `public/presets/DelayB/` | **New directory** — factory delay B presets (JSON) |
| `public/samples/piano/` | **New directory** — 120+ OGG sample files |
| iOS (future) | Remove lead/drum delay setup; add delay bus + piano sampler |

### Param Count Changes

| Category | Added | Removed | Net |
|----------|-------|---------|-----|
| Piano (L1+L2+L4) | 17 | 0 | +17 |
| Delay A engine (L3) | 12 | 0 | +12 |
| Delay B engine (L3) | 8 | 0 | +8 |
| Lead delay removal (L1) | 0 | 7 | -7 |
| Lead delay reverb send (L4) | 0 | 1 | -1 |
| Drum delay removal (L3) | 0 | 14 | -14 |
| Granular delay removal (L3) | 0 | 7 | -7 |
| Granular delay reverb send (L4) | 0 | 1 | -1 |
| Per-engine delay sends (L4) | 22 | 0 | +22 |
| Cross-feed + delay→granular (L4) | 3 | 0 | +3 |
| Granular link toggle (L3) | 1 | 0 | +1 |
| **Total** | **63** | **30** | **+33** |

Updated totals: `~763 - 30 + 63 = ~796` registry-backed keys.

---

## 6. Implementation Order

### Phase 2A — Delay Buses (do first, enables everything else)
1. Create `DelayBusA` (single-line) and `DelayBusB` (multi-tap, migrate granular 8-tap code)
2. Wire per-engine send gains to delay buses
3. Wire delay output → reverb input bus + Delay B → granular input
4. Add delay tab UI (A panel + B panel with Activity/tap indicator + cross-feed)
5. Add delay factory presets (A: single-line presets, B: multi-tap presets)
6. Remove lead delay from engine.ts (replace with sends)
7. Remove drum delay from drumSynth.ts + WASM
8. Remove granular delay from engine.ts (replaced by Delay B)
9. Legacy preset migration in `normalizePresetForWeb()` (lead→A, drum→A, granular→B)
10. Remove delay controls from Granular tab UI

### Phase 2B — Piano Sampler
1. Prepare and convert samples (WAV → OGG 22kHz mono)
2. Create `pianoSampler.ts` — loader, buffer map, playback
3. Wire piano bus with sends (reverb, delay A/B, granular)
4. Add `'piano'` to Euclidean source options
5. Add piano UI section on Synth tab
6. Register preset params

### Phase 2C — Routing Matrix + Delay–Granular Link
1. Implement `delayBGranularSend` wiring
2. Implement granular preset → delay B preset linkage
3. Build `RoutingMatrix.tsx` component
4. Add to dedicated Routing tab
5. Test all routing combinations
