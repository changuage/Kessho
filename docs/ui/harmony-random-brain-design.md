# Harmony, Random and Brain — accepted UX direction

Updated 24 November 2026. Design and implementation requirements; this document does not describe completed application changes.

This is the current design authority for Random defaults, circle-of-fifths movement, L4 preset interpolation, Brain availability and shared slider integration. It supersedes conflicting rules in the earlier Harmony UI redesign and October interaction studies. The current implementation is documented separately in [Harmony Workspace](harmony-workspace.md) and [Unified Harmony architecture](../architecture/unified-harmony.md).

The companion [UI integration contract](harmony-ui-integration.md) specifies how this design fits Kessho's existing styling, panel widths, control sizes and responsive layouts.

The [handoff index](harmony-handoff/README.md) links the supporting musical studies, sequencer and printer scopes, historical evidence, client pitch and the [interaction prototypes](harmony-handoff/prototypes/).

## Decisions (24 November 2026)

These decisions close the open questions from the November review. They take precedence over any conflicting sentence in the companion studies or prototypes. The guiding rule: **one model per concept**. Every decision below removes a parallel path rather than adding one.

| Area | Decision | Removes |
| --- | --- | --- |
| Slots | **Six uniform slots.** Any slot can be Steps, Random, Walker or Orbit. The native Chords and Notes producers become per-slot generator instances. | Singleton arrangement generators; Random-only slots; the 4 + 2 split |
| Randomness | **Each slot owns its random stream**, seeded from the global seed window and the slot's stable part ID, never its position. Migrated generator pairs take one versioned behavior change: same parameters, timing and distributions; different exact notes. | The shared `rng_state` that couples Chords and Notes |
| Live layer | **One Harmony pipeline: Engine → Live layer → Parts.** Brain is the single live layer and absorbs today's Harmony takeover. | Separate takeover route, separate takeover scope |
| Brain persistence | **Temporary, with Keep.** Return to Engine drops the live layer. Keep makes the current root the new home (today's Adopt) and the engine continues generatively from there. | Adopt as a separate workspace action |
| Pad gesture | **Latch by default.** Holding with a modifier, or a long press, is momentary. | — |
| Suggestions | **One suggestion engine, two views.** Brain pads show its top three moves; All moves expands to the full eight with the Z X C V B N M , shortcuts. | A second ranking for Brain |
| Smooth | **One shared voicing resolver** for Brain moves and authored chords. Random Chords keeps its existing renderer unchanged. | Per-feature voicing code |
| Midpoint rights | **Live at any held blend; authoring at endpoints.** The projection exposes `liveAvailable` and `authoringAvailable` instead of one `morphLocked`. | Overloaded `manualControlAvailable` |
| Chords | **Full overhaul, no backward compatibility.** No shipped preset uses authored chords, so the chord model is rebuilt from scratch: see [Chords](#chords). The Random Chords *generator* is not an authored chord and keeps its behavior. | Everything listed under [What is deleted](#what-is-deleted) |
| Chord value | **One `Chord` type stored inline wherever it is used.** A single note is a one-note Chord. Two behaviors: **Follow** (resolves against the current harmony) and **Fixed** (exact notes). | `SharedHarmonyChord`, `HarmonyIntent` bookkeeping, `Auto` playback behavior |
| Sharing | **Copy/Place and a Palette, never references.** The Palette is a per-preset list of saved Chords used only as a copy source. | The 8-slot shared bank, links, Manage Pool, use counts, locks |
| Pitch in Steps | **One Notes lane.** Each cell holds a Chord, Harmony (play the current Harmony chord) or Rest. The lane's `Advance: Steps / Hits` setting replaces the separate chord-choice sequencer. | Play chord sub-sequencer and `synthPlayConfigs`; local step intervals |
| Articulation | **Chord · Strum · Arp** per lane, overridable per cell. | Play `mode: arp | chord`, `ProductChordStyle` |
| Editing | **Direct edits with Undo.** Pressing a key or pad auditions immediately. | Draft → Capture choreography |
| Global Harmony | **One surface with drawers.** The Simple / Detail / Overview tabs are removed. | Harmony workspace tabs |
| Synth views | **Part + Overview.** Part is the selected slot's full editor. Overview is a high-level macros view of all six slots. | Simple view; unused `scatter` / `chain` view modes |
| Key motion | Labelled **Key drift** (`Key motion: Held / Drift`), matching the code name `cofDrift`. | Collision with Walker and Mod A/B Walk |
| Pattern / Harp | **Later phase.** The performance contract leaves room for them; they are not built or shown now. | — |
| Cleanup | **Each phase deletes the code it supersedes in the same change.** Only preset decoders and migrations stay. No feature flags or parallel fallbacks. | Accumulated dead paths |

## One Harmony pipeline

Harmony plays itself by default and can be shaped by hand when wanted. Both are the same pipeline, so the two never disagree about what is sounding.

```text
Engine        progression · key drift · L4 / Journey route         autonomous, always running
  │
Live layer    root shape (circle) · destination (Brain pads)       temporary; latched by default
  │           Return → drop layer        Keep → becomes Home (authoring only at endpoints)
  ▼
Parts 1–6     Respond to Brain on/off · own voicing, range, articulation
  │
Capture tap   pre-live-layer notes → Print
```

**Engine.** Generative progression, key drift and preset morphing run with no interaction, exactly as Harmony does today. Journey owns the route while it transitions; otherwise Harmony owns key drift.

**Live layer.** One small native state: a root offset (from tapping a key on the circle), a destination Chord (from a Brain pad, a suggestion or a chord played on the keyboard), latch state, and the participating-part mask. Brain pads and suggestions are the same thing: the pads show the top three suggested destinations. There is no second takeover route. The layer reads the resolved effective frame, including drift and the held blend position, and recomputes only when that frame or the gesture changes. Harmony-following parts play the destination through the shared voicing resolver (Smooth). Melodic parts move by the same number of scale degrees and keep their contour. Fixed chords and parts with Respond to Brain off are untouched.

**Return and Keep.** Return to Engine drops the layer at the next musical boundary and rejoins the then-current frame. Keep writes the current root as Home and clears the layer, so the engine carries on from the new key. Keep is an authoring action: available at endpoints, disabled at an intermediate blend.

**Availability.** The projection publishes `owner` (`engine` | `journey`), `liveAvailable` (false only while Journey is transitioning) and `authoringAvailable` (false at intermediate blends and during transitions). Every surface reads these two flags; none derives them from morph percentage.

**Keyboard scopes.** Two scopes remain: `harmony-live` (the live layer) and `chord-entry` (the one Chord editor, whether it targets a Steps cell or a progression event). The `draft`, `harmony-takeover` and `seq-live` scopes collapse into these.

## Chords

No shipped preset uses authored chords: the bundled presets hold only default chord slots and a disabled, all-`auto` progression, and the native engine reads the chord bank only for slot-sourced progression events. The authored chord system is therefore rebuilt with no decoders, migrations or compatibility paths. Old chord fields in a loaded preset are ignored and dropped on the next save. The Random Chords generator is unaffected: it plays the Harmony engine's current chord with its existing renderer.

### One value type

```ts
type Chord = {
  behavior: 'follow' | 'fixed';
  // Follow: what to play, relative to the current harmony
  degree: number;               // scale degree of the root in the effective key
  quality: ChordQuality;        // 'diatonic' takes the in-key quality
  extensions: Extension[];
  voicing: { inversion: number; spread: number; register: number; bass: 'root' | 'inversion' | number };
  // Fixed: exactly what to play; Follow: last resolved notes, for display only
  notes: ChordNote[];           // 1–8; a single note is a one-note Chord
};
type ChordNote = { midi: number; velocity?: number; offset?: number; gate?: number; destination?: SourceId };
```

- **Follow** resolves `degree`, `quality`, `extensions` and `voicing` against the effective frame (Home, key drift, L4 route, live layer) once, at event time, through the shared voicing resolver.
- **Fixed** plays `notes` exactly and bypasses every transformation. Printed and recorded takes are Fixed Chords; their per-note `velocity`, `offset`, `gate` and `destination` carry the performance the printing scope requires.
- Literal keys entered in the editor create a Fixed Chord. Choosing a root and quality creates a Follow Chord. One toggle in the editor converts between them: Follow → Fixed pins the currently resolved notes; Fixed → Follow recognizes the nearest degree and quality.
- The chord name is computed for display, never stored. Recognition is a pure function.

### Where Chords live

| Place | Holds | Clock |
| --- | --- | --- |
| Harmony progression (A and B endpoints) | Events of `auto` (engine chooses) or an inline Chord, each with a 1/2/4/8 bar-or-phrase duration; 64 events | Harmony clock |
| Steps Notes lane | Cells of Chord, `harmony` (play the current Harmony chord) or `rest` | Lane's own length; `Advance: Steps` (every step) or `Hits` (only audible triggers advance, so rests don't consume a chord) |
| Palette | Up to 16 saved Chords per preset; a copy source only | — |
| Live layer | One destination Chord while engaged | Musical boundary |

Nothing references anything else. Copy/Place and the Palette are the only ways to reuse a chord, so editing one cell or event never changes another. Multi-cell selection is the way to edit several at once.

### Articulation

Each Notes lane has a default articulation: **Chord**, **Strum** (direction, spread, curve, velocity falloff) or **Arp** (pattern, rate, octaves, gate). A cell can override it. Pattern and Harp are later additions to this same field.

### Native contract

- One bounded `Chord` encoding (up to 8 notes) shared by the progression, Notes lane cells, the Palette, the live layer and printing. One encoder in TypeScript, one decoder and validator in native.
- One resolver, in native, used for live, scheduled and printed chords. UI previews read resolved notes from the projection or call the same native function. Do not keep a TypeScript reimplementation.
- The Notes lane's existing pitch binding modes (`polyrhythmic`, `linked`, `sequence`) must map onto `Advance: Steps / Hits`; remove any mode that only duplicated the chord-choice traversal.

### What is deleted

- The 8-slot shared bank and its A/B copies: `harmonyChordSlots*`, `HarmonyChordSlot`, native `harmony_slot_midi` / `harmony_slot_note_count`, and the slot strip.
- Bank management: Manage Pool, Replace References, Make Unique, locks, use counts, `harmonyBankAnalysis`.
- The Play chord sub-sequencer: `synthPlayConfigs`, `ProductPlayConfig`, the chord mode of `productPlaySequencer`, `SeqChordChoiceLane`, `SeqChordInteractionBay`, `SeqDraftControls`, `SeqLiveChordControls`.
- Local step intervals in printed variations, replaced by Chord cells.
- Draft and Capture: `HarmonyDraftChord`, `useHarmonyChordCapture`, Save S#.
- `SharedHarmonyChord` bookkeeping: `intentSource`, `capturedContext`, `recognitionCandidates`, `recognitionMismatch`, `requiresSemanticSelection`, and the `Auto` playback behavior.
- All legacy chord decoders: `harmonyChordSequence*`, `chordProgression*`, the native numeric `progression_pattern` path, and legacy lane-specific chord/arp keys.

## Product contract

The new interface preserves the existing musical behavior of Random. Both newly created Random slots and migrated presets use the current generation algorithms, parameter meanings and timing behavior. There is no user-facing “legacy” mode required to recover the existing sound. The one deliberate change is the per-slot random stream: migrated generator pairs keep their parameters, timing and character, but play different exact notes.

Harmony supplies the shared context and generative progression. A sequencer slot supplies a performance. Brain supplies an optional, non-destructive live transformation of participating parts. A preset loaded with Brain neutral must preserve its previous musical behavior, subject to the randomness change above.

Sequencer types are **Steps · Random · Walker · Orbit**. Random has **Notes / Chords** modes, each retaining its own settings. There are six uniform slots; any of them can be any type, including several Random slots in the same mode. Several slots may address the same sound source. Printing is optional; generators can continue indefinitely without becoming Steps.

## Random: existing functionality is the default

### Chords

- Use the current chord renderer and the Harmony note pool. Harmony owns chord progression, its harmonic clock and chords-per-phrase behavior.
- Default timing is **Follow Harmony**. The renderer retriggers at the existing Harmony ticks, including ticks that resolve the same chord. Do not replace this with per-step probability or an independent random chord-density algorithm.
- Preserve the existing wave timing: staggered voice entries occupy a fraction of the chord interval. This can span many seconds; it is distinct from the short strum articulation used for an authored chord.
- Preserve voice count 1–8, voice masks, register, pad voice identities, Pad 1/Pad 2 split routing, source-specific gates, envelope fitting and release behavior.
- Preserve Harmony's voicing-spread behavior and ownership. A convenient control in the slot may edit or link to that shared parameter, but must not silently create an unrelated local copy.
- Any future independent chord clock or alternative distribution is an explicit addition. It does not replace the default or appear as a new requirement for loading existing presets.

### Notes

- Use the current random-timing generator: its density-to-event-count behavior, continuous event placement within the phrase, velocity distribution, note selection, octave and range limits.
- Preserve the existing clock-source and synchronization choices, including seconds-based phrases. Do not substitute quantized sixteenth-note probability, a fixed gate or bars-only timing.
- Preserve source-specific hold behavior and the relationship between Harmony tension, per-part tension settings and chord-tone preference. A simplified “Chord tones” control must not sever that relationship.
- Harmony continues to supply the pitch context. The Notes generator retains its existing timing relationship to Harmony; sharing pitches does not force both Random modes to have identical attack timing.

### Parameter motion remains available

Every existing parameter behavior survives: static value, moving range, modulation-source assignment and stored behavior metadata. All sliders must use the [existing shared slider architecture](#all-sliders-use-the-existing-shared-architecture). Do not turn a moving density, register or wave-spread control into a static slider during migration.

Distinguish three concepts in the UI:

| Label / location | Meaning |
| --- | --- |
| **Key drift**, in Global Harmony's Key motion | The tonal center moves around the circle of fifths using the existing drift engine. |
| **Mod A / Mod B**, on a parameter | The assigned shared modulation source moves the value within its stored range. Retain the existing source and mode labels. |
| **Walker**, in a sequencer slot | A note-generating sequencer with its own movement, layers and anchor. |

A parameter's motion uses the existing range handles, runtime indicator and source/mode control. Opening its shared context control reveals the relevant detail. Preserve stored modes even while the inspector is closed; hiding a control never disables its behavior.

### Compact Random surface

The shared slot header contains the sound destination, enable/mute, type, Harmony relationship, Print and Record. Only the selected mode's editor is visible.

| Mode | Visible first | Available on selection / in a detail drawer |
| --- | --- | --- |
| Chords | Note-entry timing visualization; voice count; wave timing; `Timing · Harmony` | Register, voice allocation/split routing, envelope fitting, parameter motion, link to global voicing and harmonic rate |
| Notes | Note-attack visualization; density; register/range | Clock and sync policy, tension relationship, source hold, parameter motion |

The two modes remember their settings when switched. Migrating a preset with both generators enabled creates two active Random slots with their original destinations and settings. It does not merge them into a mutually exclusive mode choice. Existing disabled sequencer content is retained too.

## All sliders use the existing shared architecture

**Every slider in this redesign uses Kessho's existing shared slider infrastructure.** This covers Global/Harmony, numeric Brain controls, both Random modes, Steps inspectors and sublanes, Walker, Orbit, and L4/Journey. Moving a control, hiding its detail or making it visually compact must not replace its behavior with a page-local slider.

### One control system, appropriate capabilities

Use the shared `Slider` renderer and its runtime props for registered application parameters. It adapts to `DualSlider` and the underlying `SliderPrimitive`; single-only parameters also use that same primitive. Preserve the existing compact/matrix variants, domain mapping, logarithmic response, quantization, units, fine/keyboard adjustment, reset, MIDI learn and help behavior where supported. Do not recreate range handles or gesture handling with local HTML range inputs.

The central capability registry determines which modes a parameter supports. Sharing the architecture does not grant every parameter every modulation mode. Keep intentional single-only controls and existing mode restrictions; register new parameters and connect a valid runtime target before exposing additional modes. Brain gestures remain live-only in this scope: a shared slider appearance must not introduce Brain sequencing or automation.

Sequencer-content ranges and the L4 blend retain their existing data ownership and dedicated adapters while reusing the shared control surface. Do not reinterpret a subsequencer's note boundaries as a parameter-modulation range, or give Journey a competing local morph controller.

### Shared modulation, preserved state

The canonical per-parameter binding is `DualSliderConfig { source, range }`. The source is **Mod A or Mod B**; source settings live in shared `modulationSourceA` / `modulationSourceB` state. Walk, Sample & Hold and Shape behavior comes from the assigned source, subject to the parameter's capabilities. Do not create a walk engine, oscillator, speed or phase state per slider. Editing a shared source must remain visibly an edit to Mod A/B, so its effect on other assigned parameters is clear.

Use the existing reducer, runtime binding and preset metadata paths. Preserve the authored value, assignment, range, shared source settings and endpoint/scope ownership through load/save, morph, slot movement and inspector remounts. Keep stable parameter identities; renamed or relocated parameters need explicit migration mappings. Legacy mode/range metadata continues through the existing compatibility conversion, without a second persistence format.

### Less visible detail, unchanged behavior

The resting control shows its value, range/runtime marker and existing source/mode affordance. Open the shared context panel for deeper settings; do not add a permanent modulation dashboard or a second page-specific Motion editor. The same parameter shown on Global and Synth edits the same state. Closing a drawer never removes a binding or stops its source.

Reuse frame-coalesced edit callbacks, final-value flush on release, cancellation behavior and shared runtime-indicator subscriptions. Runtime motion stays owned by the existing modulation engine; display frames are not its musical clock. Avoid per-slider timers, duplicate animation loops, whole-page renders for every indicator update, and writing moving runtime values back into authored preset state. Keep input monitoring and recording timestamps independent of visual update cadence.

Implementation anchors:

| Responsibility | Existing implementation |
| --- | --- |
| Shared app renderer and adapter | [AppControls](../../src/app/AppControls.tsx), [DualSlider](../../src/ui/DualSlider.tsx) |
| Surface, gestures and contextual controls | [SliderPrimitive](../../src/ui/sliderSystem/SliderPrimitive.tsx), [SliderContextControl](../../src/ui/sliderSystem/SliderContextControl.tsx) |
| Capability policy and canonical bindings | [sliderCapabilities](../../src/ui/sliderSystem/sliderCapabilities.ts), [dualConfigReducer](../../src/ui/sliderSystem/dualConfigReducer.ts) |
| Runtime props and ownership | [useDualSliderRuntimeState](../../src/app/useDualSliderRuntimeState.ts), [runtimeSliderState](../../src/ui/runtimeSliderState.ts) |
| Edit coalescing and preset compatibility | [useRafCoalescedEmitter](../../src/ui/sliderSystem/useRafCoalescedEmitter.ts), [versionMetadataHelpers](../../src/presets/versionMetadataHelpers.ts) |

## One circle of fifths, three musical uses

Keep the outer circle in the same twelve-key fifths order: C–G–D–A–E–B–F♯–D♭–A♭–E♭–B♭–F. Its positions always represent tonal centers. The center displays the currently resolved chord. Brain's in-scale destinations are a separate compact set of performance pads; the outer ring does not change into seven scale degrees.

| Use | What changes | Representation |
| --- | --- | --- |
| **Chord progression** | The chord within the current harmonic context | A compact progression strip below the circle, with the current chord in the center. A fifths-based progression remains available. |
| **Key drift** | Harmony's tonal center over time | Home marker, effective key and a faint permitted range on the same circle. Show the next move only when the engine actually knows it. |
| **Preset transition** | The harmonic context as L4 moves between preset states | A/B endpoint markers, the resolved fifths route and current position on that same circle. |

Changing a chord is not automatically a key modulation. A fifths-based chord progression and fifths-based key drift remain separate engine behaviors. Do not duplicate the circle in every sequencer slot; a compact Harmony link returns to this Global surface.

## Key drift with the Harmony engine

Expose **Key motion: Held / Drift** beside the circle. Opening its detail reveals the existing enable state, home key, direction (clockwise, counterclockwise or random), rate in phrases and bounded range. Retain the existing range/return behavior and timing units. “Drift” means autonomous Harmony movement, not an unlimited range or unsynchronized clock.

Key drift works with generative Harmony and all Harmony-following sequencers, including both Random modes. It can coexist with a chord progression. Parameter motion and the Walker sequencer continue independently.

Key drift is also available at a held L4 blend. **A fixed 50% A / 50% B blend fixes the preset weights; it does not freeze the harmonic progression or key drift.** The resolved blend supplies the home/context for the existing drift engine. Key drift changes the effective key without moving the morph slider or writing new values into the saved A/B presets.

Brain remains available while Harmony's key drifts. Its analysis reads the engine intention and actual pre-Brain notes. Keep context stable during a live gesture; the engine's progression and drift can continue underneath. Return to Engine rejoins the then-current harmonic frame, including its current drift position, rather than restoring an earlier key.

## Circle-of-fifths interpolation between L4 presets

Retain the existing fifths-route interpolation between preset harmonic contexts, including the current handling of drifted/captured start roots. Reuse the production route calculation and endpoint-resolution rules. The prototype's approximate root thresholds are not the specification.

The UI shows preset A, preset B, their blend weights and one connecting route. Manual blends such as **50 A / 50 B** or **25 A / 75 B** are first-class playable states. They do not require snapping to an endpoint to use Brain.

The visual blend can move continuously while the harmonic resolver chooses discrete musical roots and valid notes along the route. Do not imply that notes continuously glide through intermediate pitches; portamento remains a separate sound behavior. Preserve scale handover, shared parameter interpolation, saved parameter-motion ranges and existing preset ownership rules.

### Movement ownership

Only one process advances the baseline tonal-center route at a time:

1. **No active Journey transition:** Harmony owns key drift when enabled. Manual blend edits update the resolved baseline using the existing interpolation path. They do not disable Brain merely because the blend is between endpoints.
2. **Journey starts a transition:** capture the currently effective harmonic position, including drift, as the departure state. Release any active or queued Brain override at the scheduled transition boundary. Journey owns the preset route; suspend additional key-drift key advances during the transition. Do not turn off the chord progression, Random generation or unrelated parameter motion.
3. **Journey pauses at an intermediate blend:** hold the current weights. Brain is available. When transport continues, enabled key drift may run from the resolved held context. If Journey resumes after the effective key has moved, prepare its continuation from that current key to the stored destination; do not jump back to a stale departure frame or reset the morph weights.
4. **Journey arrives / dwells:** the resolved destination's stored drift configuration applies under its existing clock/reset policy. Brain is available during the stationary hold. The next Journey transition takes control again.
5. **Journey stops:** retain the current blend. Harmony owns progression/key drift according to the active configuration. Stopping the audio transport stops scheduled movement; it does not impose an endpoint requirement on the next live gesture.

Suspending key drift is a runtime ownership decision. Do not erase its enable flag, direction, range, rate, saved preset settings or modulation metadata. Do not apply both a Journey root route and an extra drift offset to the same transition. The pause/resume handoff above is an implementation requirement, not a claim that the current runtime already implements it.

## Brain availability and visible feedback

The availability rule is **Journey actively driving a transition**, never `0% < morph < 100%`.

| State | Brain | Circle / status |
| --- | --- | --- |
| Preset endpoint, held | Available | Current key and chord |
| Held intermediate blend | Available | A/B route and held position |
| Manually adjusted blend | Available | Updated blend position and resolved context |
| Harmony key drift, including at a held blend | Available | Current drift position and permitted range |
| Journey actively transitioning | Unavailable | Moving preset route; `Journey transitioning` |
| Journey paused or dwelling | Available | Held blend; key-drift motion if enabled and transport is running |
| Journey stopped | Available | Current blend retained |

Keep the Brain surface in place during a Journey transition, with disabled performance targets and one concise status. Show `Key drift paused` only in the motion detail when relevant. Do not replace the performance surface with an explanatory dashboard.

When Brain becomes available again, leave it neutral. A fresh gesture is required; never reinstate a stale override. Brain remains a live layer applied once, with per-part participation and Return to Engine. Brain sequencing/automation stays deferred. Authoring (slot edits, Print, Keep) remains endpoint-only: `authoringAvailable` is false at any intermediate blend even while `liveAvailable` is true.

## Architecture and CPU requirements

- Keep Harmony as the sole baseline context owner. Extend the existing shared projection with `owner`, `liveAvailable` and `authoringAvailable` so Global, Synth, input handling and native playback agree. Do not infer ownership from morph percentage or UI animation frames.
- Move the arrangement Chords and Notes producers into per-slot generator instances with their algorithms unchanged. Each instance owns its parameters, pending-event queue and random stream; the arrangement singleton state is removed. Keep stable part identities and preset parameter mappings across load, save and L4 morph; slot order must not swap the Chords and Notes roles between A and B.
- Seed each slot's random stream from the global seed window and its stable part ID. Reordering slots, opening inspectors or changing the selected slot never changes a stream. Bump the preset behavior version once for this change and record it in the migration notes.
- Store every authored chord as one inline `Chord` value with one encoding, one native resolver and one editor (see [Chords](#chords)). No chord references, no shared bank, no chord decoders for old presets.
- One live layer, one suggestion engine and one voicing resolver serve every surface. Do not add a Brain-specific ranking, a takeover-specific route or a per-feature voicing search.
- Preserve parameter value plus its complete motion metadata when relocating controls. Saved ownership and parameter scope are data contracts, not consequences of where a slider appears.
- Resolve context, route and bounded suggestions on musical events or actual edits. Keep analysis, sorting and allocation out of the audio callback; coalesce visible UI updates. Reuse current generators, modulation and interpolation rather than adding parallel engines.
- Keep the shared live-recording / generated-event capture path. Printing captures resolved notes before Brain, with their performed timing, gates, velocity, route and voice identity. Brain does not become recorded automation. Preserve destination-aware commit, final event drain, acknowledgement, retry and Undo requirements from the printing scope.
- Each phase deletes what it supersedes in the same change: the morph read-only banner, the separate takeover route and scope, the Synth Simple view, the uncalled generated recorder and bridge, and dead `SequencerViewMode` members. Keep decoders and migrations for old presets.

## Compatibility example and acceptance

The bundled [String Waves preset](../../public/presets/StringWaves.json) is a concrete regression fixture. The 5 November inspection found:

- Both generators enabled: six chord voices on Pad 1 and random notes on Lead 1.
- Seconds-based timing, a 16-second phrase and one chord tick per phrase.
- Saved wave spread 0.65: a 10.4-second spread window at that saved value. Its moving range is 0.48–1.0; this must not become a millisecond strum.
- Parameter walk on voicing spread, note density, octave, octave range and wave spread.
- Envelope fitting enabled; automatic scale mode; circle-of-fifths drift enabled, every four phrases, clockwise, range three.

This fixture does not establish compatibility for the entire cloud/user library. Audit those presets before declaring complete migration parity.

Required acceptance checks:

1. New Random slots use the existing algorithms and default semantics. Migrated presets use their saved values and motion settings without a compatibility toggle.
2. String Waves retains both simultaneous parts, long wave timing, changing parameter ranges, envelope behavior and key drift. Because the random stream is now per slot, compare migrated presets by event statistics (events per phrase, onset distribution, velocity range, pitch range, voice entry spread) against the old engine, then by listening.
3. Preserve eight-voice masks, split-pad routing, source-specific holds, tension relationships, supported scales and seconds/BPM clock choices across load, save and morph.
4. Each slot's event stream is deterministic for a given seed window, part ID, transport and input history. Reordering slots, opening an inspector, switching the selected slot or changing another slot's type never changes a slot's stream. Two Random Chords slots run independently.
5. The same circle clearly distinguishes chord progression, key drift and preset interpolation. Key drift changes keys while the blend weights remain fixed.
6. Brain works at 0%, 25%, 50%, 75% and 100% held blends, including while key drift runs. Returning rejoins the current engine context.
7. Journey transitions release Brain and suspend additional key drift at the scheduled boundary. Pause, dwell and stop restore availability with no stale Brain override.
8. Pause midway, let key drift change the key, then resume Journey: continue from the effective key without a stale-key jump, duplicated drift or reset of the blend weights. Preserve clean note releases and sustained common tones where supported.
9. Circle drift, parameter walk and Walker remain independently controllable. Hiding any of their controls does not stop their behavior.
10. Printing remains optional, preserves the performed events and uses the shared capture/commit path. Native timing, device latency and CPU require production verification.
11. Inventory every slider in the redesigned pages: each uses the shared renderer/primitive with the correct adapter, runtime props and registered capabilities. Verify single-only controls as well as dual-range controls; unsupported runtime modes must not appear active.
12. Round-trip Mod A/B source settings, parameter assignments, ranges and values through preset save/load and L4 morph. Reordering slots, switching Random modes and closing inspectors must preserve the same targets and ongoing motion. Existing legacy metadata must still load correctly.
13. Verify shared keyboard/fine adjustment, reset, MIDI learn where supported, final drag release and cancellation behavior. Moving indicators must not create extra modulation clocks or full-page updates; measure production CPU with several active ranges and confirm live-note timing remains independent of the UI.
14. One live layer: a Brain pad, a suggestion Play and a circle root tap all change the same native state, and one Return clears all of them. Latch holds without a finger; the momentary gesture releases at the next boundary.
15. Keep at an endpoint makes the shaped root the new Home and the engine continues generatively from it; Keep is disabled at an intermediate blend while Brain stays playable.
16. Editing one Notes cell or progression event never changes another. Copy from trigger one and Place on trigger three, and Place from the Palette, produce independent copies. With `Advance: Hits`, six hits in a sixteen-step trigger loop advance an eight-cell Notes lane by six.
17. A Follow Chord moves with key drift, the L4 route and the live layer exactly once; a Fixed Chord never moves. A one-note Chord behaves like a note. Follow → Fixed → Follow round-trips the same degree and quality for diatonic chords.
18. Presets containing old chord fields load without error, play their generative harmony unchanged and save without those fields.
19. Overview shows all six slots on one screen at the 380px panel width and supports mute/solo, destination, type, variation, step toggles, one macro per generator and the sequencer chain without opening Part.
20. No superseded path remains after its phase lands: searching for the removed takeover route, morph banner, Simple view, generated recorder, chord bank and Play chord sequencer finds nothing outside the non-chord preset decoders.

## Implementation phases

Each phase ships on its own and deletes what it replaces.

1. **Fixtures.** Record event-statistics fixtures for String Waves and a sample of library presets.
2. **Chord model and printer repair.** These land together because both define the per-step note payload: the `Chord` type, encoding and native resolver; the Notes lane with `Advance` and articulation; the inline progression; the Palette; and the shared printer writing Fixed Chords with per-note offset, velocity, gate and destination (per the [players and printing scope](harmony-handoff/kessho-players-and-printing-scope.md)). Delete everything under [What is deleted](#what-is-deleted) in the same change.
3. **Per-slot generators.** Six uniform slots in native and persistence; Chords and Notes become per-slot instances with their own streams; one behavior-version bump. Remove the arrangement singletons and the Synth Simple view; add Random to the type control.
4. **Synth Part + Overview.** Part hosts the selected slot and the Chord editor. Overview becomes the six-slot macros view with the sequencer chain. Slider inventory (acceptance 11–13) lands here.
5. **Global Harmony surface.** Circle, progression strip, Key motion, Palette, and the Arrange and Voicing drawers replace the workspace tabs.
6. **Live layer.** Brain pads, root shaping, latch, Return and Keep on one native state; the suggestion engine feeds both views; the shared voicing resolver; `liveAvailable` / `authoringAvailable`. Remove the takeover route, its scope and the morph banner.
7. **Journey handoff.** Pause/resume continuation from the drifted key and transition-boundary release of the live layer.
8. **Later.** Pattern and Harp performance modes on the existing performance contract.

## Prototype status

The [unified interaction prototype](harmony-handoff/prototypes/kessho-unified-instrument.html) demonstrates the layout, input, slot model, Brain/Journey availability and recording/printing flow. Its generator algorithms, timing units, parameter-motion controls and route thresholds are simplified. Its independent Random Chords density control is superseded by **Follow Harmony** as the default. Its standalone slider controls illustrate placement and interaction intent; they are not the production implementation reference. Production integration must use the shared architecture specified above. This documentation update does not modify that prototype or implement the production migration.
