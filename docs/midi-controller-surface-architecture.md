# MIDI controller surface architecture

Kessho's MIDI controller setup should be a reusable controller-surface system, not a collection of per-device routing implementations.

## Architectural boundary

The existing Kessho MIDI routing profile remains the source of truth for MIDI source -> Kessho parameter bindings.

The controller-surface layer adds hardware-aware metadata above routing:

1. **Manifest** — what physical controls a controller has, which are observable, and how the device should be matched.
2. **Surface state** — selected input identity, learned source per physical control, base/alternate binding slots, modifiers, and macros.
3. **Gesture runtime** — pressed-control state, logical modifiers, active layers, and control chords.
4. **Visualizer/editor** — device-shaped UI that edits the shared surface state and underlying Kessho routing bindings.

No device manifest should contain Kessho routing logic.

## Control policies

Every physical control is classified as one of:

- `mappable`: intended for Kessho parameter/action assignment.
- `performance`: kept on the note/performance path by default.
- `device-local`: drawn in the visualizer, but not assumed to emit host MIDI.
- `hybrid`: can serve both performance and controller roles.

This distinction is essential for keyboard controllers. A piano key should not be stolen from live note input merely because it is physically present in the controller visualizer.

## Logical Shift and alternate layers

Kessho modifiers are logical, not hardware-name based.

A modifier declares:

- the observable physical control used as the modifier,
- `hold` or `toggle` behavior,
- the layer it activates,
- whether the source control is consumed.

Example:

- LPD8 `Pad 8` -> modifier `Kessho Shift`, activates layer `shift` while held.
- `base:knob-1` -> Filter Cutoff.
- `shift:knob-1` -> Reverb Size.

The same runtime works with Launch Control or any future device. A hardware Shift button is only usable if it actually produces an observable MIDI event; otherwise any other button/pad/pedal can be designated as Kessho Shift.

## Chord macros

A chord macro is separate from layers. It fires when a set of observable controls is pressed within a small timing window.

Example:

- `Pad 7 + Pad 8` within 120 ms -> `action: randomize-current-scene`.

Macro outputs can be:

- a parameter value,
- a logical layer activation,
- a future Kessho command/action-bus event.

The action output is intentionally not encoded as `SliderState`; transport, preset, randomize, capture, sequencer, and UI commands should eventually share a typed Kessho command bus.

## LPD8 Wireless

The LPD8 is the first full visual editor.

- Eight pads are `hybrid` because programs may expose them as notes or CC.
- Eight pots are `mappable` continuous controls.
- Controller-local mode buttons are represented for orientation but are not assumed routable.
- Parameter mappings continue to create ordinary Kessho MIDI routing bindings.

The current LPD8 popup is the first concrete visualizer adapter. Device-independent behavior should continue moving into `src/native/midi/controllers` and shared editor components rather than being added directly to the LPD8 dialog.

## Arturia KeyStep 32

The original KeyStep profile is intentionally conservative:

- 32 keys are `performance` controls.
- Pitch strip, Mod strip, and sustain are `hybrid`/observable MIDI controls.
- Shift, octave, sequencer transport, Rate, and Time Division are shown as onboard controls but are not assumed to emit directly usable MIDI messages.

This means a KeyStep can still use Kessho layers/macros by assigning an observable source (for example sustain or another emitted control) as a logical modifier. If a particular KeyStep mode/firmware exposes additional buttons over MIDI, MIDI Learn can promote those controls in a future device-specific capability override.

## Future Launch Control profile

A Launch Control-class controller should only require:

- a manifest defining knobs/faders/buttons,
- optional known source hints,
- a device visualizer layout.

The same routing, persistence, modifiers, macro engine, conflict detection, input identity handling, and Kessho target catalog should be reused.

## Next implementation steps

1. Migrate the LPD8 popup's local surface-state adapter to `MidiControllerSurfaceState` directly.
2. Add a generic `ControllerMappingInspector` shared by all visualizers.
3. Feed observable button/note gestures into `controllerMacroEngine` before normal routing, honoring `consumeInputs`.
4. Add a typed Kessho command/action bus for non-parameter macro outputs.
5. Add UI for creating modifiers, alternate layer mappings, and chord macros.
6. Add a KeyStep visualizer using the registered manifest.
7. Add Launch Control as the third manifest to validate that no LPD8/KeyStep assumptions leaked into shared code.
