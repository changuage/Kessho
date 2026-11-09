# Harmony, Random and Brain — accepted UX direction

Updated 5 November 2026. Design and implementation requirements; this document does not describe completed application changes.

This is the current design authority for Random defaults, circle-of-fifths movement, L4 preset interpolation, Brain availability and shared slider integration. It supersedes conflicting rules in the earlier Harmony UI redesign and October interaction studies. The current implementation is documented separately in [Harmony Workspace](harmony-workspace.md) and [Unified Harmony architecture](../architecture/unified-harmony.md).

The companion [UI integration contract](harmony-ui-integration.md) specifies how this design fits Kessho's existing styling, panel widths, control sizes and responsive layouts.

## Product contract

The new interface preserves the existing musical behavior of Random. Both newly created Random slots and migrated presets use the current generation algorithms, parameter meanings and timing behavior. There is no user-facing “legacy” mode required to recover the existing sound.

Harmony supplies the shared context and generative progression. A sequencer slot supplies a performance. Brain supplies an optional, non-destructive live transformation of participating parts. A preset loaded with Brain neutral must preserve its previous musical behavior.

Sequencer types are **Steps · Random · Walker · Orbit**. Random has **Notes / Chords** modes, each retaining its own settings. Two Random slots can run the two modes simultaneously. Preserve at least the current six simultaneous processes: four existing sequencer slots plus the two arrangement generators. Several slots may address the same sound source. Printing is optional; generators can continue indefinitely without becoming Steps.

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
| **Free walk**, in Global Harmony's Key motion | The tonal center moves around the circle of fifths using the existing drift engine. |
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
| **Free walk** | Harmony's tonal center over time | Home marker, effective key and a faint permitted range on the same circle. Show the next move only when the engine actually knows it. |
| **Preset transition** | The harmonic context as L4 moves between preset states | A/B endpoint markers, the resolved fifths route and current position on that same circle. |

Changing a chord is not automatically a key modulation. A fifths-based chord progression and fifths-based key drift remain separate engine behaviors. Do not duplicate the circle in every sequencer slot; a compact Harmony link returns to this Global surface.

## Free walking with the Harmony engine

Expose **Key motion: Held / Free walk** beside the circle. Opening its detail reveals the existing enable state, home key, direction (clockwise, counterclockwise or random), rate in phrases and bounded range. Retain the existing range/return behavior and timing units. “Free” means autonomous Harmony movement, not an unlimited range or unsynchronized clock.

Free walk works with generative Harmony and all Harmony-following sequencers, including both Random modes. It can coexist with a chord progression. Parameter motion and the Walker sequencer continue independently.

Free walk is also available at a held L4 blend. **A fixed 50% A / 50% B blend fixes the preset weights; it does not freeze the harmonic progression or free walk.** The resolved blend supplies the home/context for the existing drift engine. Free walk changes the effective key without moving the morph slider or writing new values into the saved A/B presets.

Brain remains available while Harmony freely walks. Its analysis reads the engine intention and actual pre-Brain notes. Keep context stable during a live gesture; the engine's progression and drift can continue underneath. Return to Engine rejoins the then-current harmonic frame, including its current drift position, rather than restoring an earlier key.

## Circle-of-fifths interpolation between L4 presets

Retain the existing fifths-route interpolation between preset harmonic contexts, including the current handling of drifted/captured start roots. Reuse the production route calculation and endpoint-resolution rules. The prototype's approximate root thresholds are not the specification.

The UI shows preset A, preset B, their blend weights and one connecting route. Manual blends such as **50 A / 50 B** or **25 A / 75 B** are first-class playable states. They do not require snapping to an endpoint to use Brain.

The visual blend can move continuously while the harmonic resolver chooses discrete musical roots and valid notes along the route. Do not imply that notes continuously glide through intermediate pitches; portamento remains a separate sound behavior. Preserve scale handover, shared parameter interpolation, saved parameter-motion ranges and existing preset ownership rules.

### Movement ownership

Only one process advances the baseline tonal-center route at a time:

1. **No active Journey transition:** Harmony owns free walk when enabled. Manual blend edits update the resolved baseline using the existing interpolation path. They do not disable Brain merely because the blend is between endpoints.
2. **Journey starts a transition:** capture the currently effective harmonic position, including drift, as the departure state. Release any active or queued Brain override at the scheduled transition boundary. Journey owns the preset route; suspend additional free-walk key advances during the transition. Do not turn off the chord progression, Random generation or unrelated parameter motion.
3. **Journey pauses at an intermediate blend:** hold the current weights. Brain is available. When transport continues, enabled free walk may run from the resolved held context. If Journey resumes after the effective key has moved, prepare its continuation from that current key to the stored destination; do not jump back to a stale departure frame or reset the morph weights.
4. **Journey arrives / dwells:** the resolved destination's stored drift configuration applies under its existing clock/reset policy. Brain is available during the stationary hold. The next Journey transition takes control again.
5. **Journey stops:** retain the current blend. Harmony owns progression/free walk according to the active configuration. Stopping the audio transport stops scheduled movement; it does not impose an endpoint requirement on the next live gesture.

Suspending free walk is a runtime ownership decision. Do not erase its enable flag, direction, range, rate, saved preset settings or modulation metadata. Do not apply both a Journey root route and an extra drift offset to the same transition. The pause/resume handoff above is an implementation requirement, not a claim that the current runtime already implements it.

## Brain availability and visible feedback

The availability rule is **Journey actively driving a transition**, never `0% < morph < 100%`.

| State | Brain | Circle / status |
| --- | --- | --- |
| Preset endpoint, held | Available | Current key and chord |
| Held intermediate blend | Available | A/B route and held position |
| Manually adjusted blend | Available | Updated blend position and resolved context |
| Harmony free walk, including at a held blend | Available | Current drift position and permitted range |
| Journey actively transitioning | Unavailable | Moving preset route; `Journey transitioning` |
| Journey paused or dwelling | Available | Held blend; free-walk motion if enabled and transport is running |
| Journey stopped | Available | Current blend retained |

Keep the Brain surface in place during a Journey transition, with disabled performance targets and one concise status. Show `Free walk paused` only in the motion detail when relevant. Do not replace the performance surface with an explanatory dashboard.

When Brain becomes available again, leave it neutral. A fresh gesture is required; never reinstate a stale override. Brain remains a live layer applied once, with per-part participation and Return to Engine. Brain sequencing/automation stays deferred. This availability rule does not automatically grant authoring access to every A/B preset bank at a midpoint; preset-writing targets require their own explicit rules.

## Architecture and CPU requirements

- Keep Harmony as the sole baseline context owner. Extend the existing shared projection with the runtime movement owner and Brain availability so Global, Synth, input handling and native playback agree. Do not infer ownership from morph percentage or UI animation frames.
- Wrap the existing arrangement Chords and Notes producers in the common slot model before changing their algorithms. Keep stable part identities and preset parameter mappings across load, save and L4 morph; slot order must not accidentally swap the Chords and Notes roles between A and B.
- Preserve the original random seed/window, call ordering and reset behavior for migrated generator pairs. Merely allocating new per-slot seeds can change deterministic performances. Any deliberate algorithm/seed change needs an explicit versioned behavior decision.
- Preserve parameter value plus its complete motion metadata when relocating controls. Saved ownership and parameter scope are data contracts, not consequences of where a slider appears.
- Resolve context, route and bounded suggestions on musical events or actual edits. Keep analysis, sorting and allocation out of the audio callback; coalesce visible UI updates. Reuse current generators, modulation and interpolation rather than adding parallel engines.
- Keep the shared live-recording / generated-event capture path. Printing captures resolved notes before Brain, with their performed timing, gates, velocity, route and voice identity. Brain does not become recorded automation. Preserve destination-aware commit, final event drain, acknowledgement, retry and Undo requirements from the printing scope.

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
2. String Waves retains both simultaneous parts, long wave timing, changing parameter ranges, envelope behavior and free key drift. Compare generated event streams with the same seed, transport and input/control history; then verify audio behavior.
3. Preserve eight-voice masks, split-pad routing, source-specific holds, tension relationships, supported scales and seconds/BPM clock choices across load, save and morph.
4. Preserve random event timing and seed/reset semantics when moving the producers into slots; opening an inspector or changing the selected slot must not change the music.
5. The same circle clearly distinguishes chord progression, free key walk and preset interpolation. Free walk changes keys while the blend weights remain fixed.
6. Brain works at 0%, 25%, 50%, 75% and 100% held blends, including while free walk runs. Returning rejoins the current engine context.
7. Journey transitions release Brain and suspend additional key drift at the scheduled boundary. Pause, dwell and stop restore availability with no stale Brain override.
8. Pause midway, let free walk change the key, then resume Journey: continue from the effective key without a stale-key jump, duplicated drift or reset of the blend weights. Preserve clean note releases and sustained common tones where supported.
9. Circle drift, parameter walk and Walker remain independently controllable. Hiding any of their controls does not stop their behavior.
10. Printing remains optional, preserves the performed events and uses the shared capture/commit path. Native timing, device latency and CPU require production verification.
11. Inventory every slider in the redesigned pages: each uses the shared renderer/primitive with the correct adapter, runtime props and registered capabilities. Verify single-only controls as well as dual-range controls; unsupported runtime modes must not appear active.
12. Round-trip Mod A/B source settings, parameter assignments, ranges and values through preset save/load and L4 morph. Reordering slots, switching Random modes and closing inspectors must preserve the same targets and ongoing motion. Existing legacy metadata must still load correctly.
13. Verify shared keyboard/fine adjustment, reset, MIDI learn where supported, final drag release and cancellation behavior. Moving indicators must not create extra modulation clocks or full-page updates; measure production CPU with several active ranges and confirm live-note timing remains independent of the UI.

## Prototype status

The unified interaction prototype demonstrates the layout, input, slot model, Brain/Journey availability and recording/printing flow. Its generator algorithms, timing units, parameter-motion controls and route thresholds are simplified. Its independent Random Chords density control is superseded by **Follow Harmony** as the default. Its standalone slider controls illustrate placement and interaction intent; they are not the production implementation reference. Production integration must use the shared architecture specified above. This documentation update does not modify that prototype or implement the production migration.
