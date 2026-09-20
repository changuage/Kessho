import type { SliderState } from '../../../ui/state';
import type { KesshoMidiMessageKind, KesshoMidiValueCurve } from '../midiTypes';

export type MidiControllerControlKind =
  | 'knob'
  | 'encoder'
  | 'fader'
  | 'pad'
  | 'button'
  | 'key'
  | 'touch-strip'
  | 'pedal'
  | 'transport'
  | 'system';

/**
 * mappable: intended for Kessho parameter/action assignment.
 * performance: note/performance path by default (e.g. piano keys).
 * device-local: useful in the visualizer but not expected to emit host MIDI.
 * hybrid: can participate in performance and controller mappings.
 */
export type MidiControllerControlPolicy = 'mappable' | 'performance' | 'device-local' | 'hybrid';

export type MidiControllerControlBehavior =
  | 'continuous'
  | 'momentary'
  | 'toggle'
  | 'modifier'
  | 'performance-note';

export type MidiControllerSourceHint = {
  kind: KesshoMidiMessageKind;
  channel?: number | null;
  number?: number | null;
};

export type MidiControllerControlDefinition = {
  id: string;
  label: string;
  kind: MidiControllerControlKind;
  policy: MidiControllerControlPolicy;
  defaultBehavior: MidiControllerControlBehavior;
  group?: string;
  index?: number;
  sourceHints?: readonly MidiControllerSourceHint[];
  velocitySensitive?: boolean;
  relative?: boolean;
  description?: string;
};

export type MidiControllerLayoutSection = {
  id: string;
  label?: string;
  controlIDs: readonly string[];
  columns?: number;
};

export type MidiControllerDeviceMatcher = {
  namePatterns: readonly RegExp[];
  manufacturerPatterns?: readonly RegExp[];
  preferredTransports?: readonly ('usb' | 'bluetooth' | 'network' | 'virtual' | 'other' | 'unknown')[];
};

export type MidiControllerManifest = {
  id: string;
  vendor: string;
  model: string;
  displayName: string;
  matcher: MidiControllerDeviceMatcher;
  controls: readonly MidiControllerControlDefinition[];
  layout: readonly MidiControllerLayoutSection[];
  notes?: readonly string[];
};

export type MidiControllerSourceAssignment = {
  kind: KesshoMidiMessageKind;
  channel: number | null;
  number: number | null;
};

export type MidiControllerBindingSlot = {
  controlID: string;
  /** `base` is the unmodified layer. Other IDs are activated by logical modifiers. */
  layerID: string;
  source: MidiControllerSourceAssignment | null;
  bindingID: string | null;
};

export type MidiControllerModifierMode = 'hold' | 'toggle';

export type MidiControllerModifierDefinition = {
  id: string;
  label: string;
  controlID: string;
  mode: MidiControllerModifierMode;
  layerID: string;
  /** Prevent the source button from also firing its base assignment. */
  consumeSource: boolean;
};

export type MidiControllerSurfaceState = {
  version: 1;
  manifestID: string;
  inputUniqueID: number | null;
  inputName: string | null;
  inputPersistentIdentity: string | null;
  slots: Record<string, MidiControllerBindingSlot>;
  modifiers: MidiControllerModifierDefinition[];
  macros: MidiControllerMacroDefinition[];
};

export type MidiControllerMacroTrigger =
  | {
    type: 'chord';
    controlIDs: readonly string[];
    /** Maximum spacing between presses before they stop counting as one chord. */
    withinMs: number;
  }
  | {
    type: 'modified-control';
    modifierID: string;
    controlID: string;
  };

export type MidiControllerMacroOutput =
  | {
    type: 'activate-layer';
    layerID: string;
    mode: MidiControllerModifierMode;
  }
  | {
    type: 'parameter';
    targetKey: keyof SliderState;
    value: number;
  }
  | {
    /** Routed to a future Kessho command/action bus rather than SliderState. */
    type: 'action';
    actionID: string;
    payload?: unknown;
  };

export type MidiControllerMacroDefinition = {
  id: string;
  label: string;
  enabled: boolean;
  trigger: MidiControllerMacroTrigger;
  outputs: readonly MidiControllerMacroOutput[];
  priority: number;
  consumeInputs: boolean;
};

export type MidiControllerParameterTransform = {
  minimumValue: number;
  maximumValue: number;
  curve: KesshoMidiValueCurve;
  invert: boolean;
  smoothingMs: number;
};

export function controllerSlotKey(controlID: string, layerID = 'base'): string {
  return `${layerID}:${controlID}`;
}

export function createControllerLayerSlot(
  state: MidiControllerSurfaceState,
  controlID: string,
  layerID: string,
): MidiControllerBindingSlot {
  const base = state.slots[controllerSlotKey(controlID, 'base')];
  return {
    controlID,
    layerID,
    source: base?.source ? { ...base.source } : null,
    bindingID: null,
  };
}

export function createControllerSurfaceState(manifest: MidiControllerManifest): MidiControllerSurfaceState {
  const slots = Object.fromEntries(manifest.controls
    .filter((control) => control.policy === 'mappable' || control.policy === 'hybrid')
    .map((control) => [controllerSlotKey(control.id), {
      controlID: control.id,
      layerID: 'base',
      source: control.sourceHints?.[0]
        ? {
          kind: control.sourceHints[0].kind,
          channel: control.sourceHints[0].channel ?? null,
          number: control.sourceHints[0].number ?? null,
        }
        : null,
      bindingID: null,
    } satisfies MidiControllerBindingSlot]));

  return {
    version: 1,
    manifestID: manifest.id,
    inputUniqueID: null,
    inputName: null,
    inputPersistentIdentity: null,
    slots,
    modifiers: [],
    macros: [],
  };
}
