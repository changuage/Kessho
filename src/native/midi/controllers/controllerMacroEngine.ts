import type {
  MidiControllerMacroDefinition,
  MidiControllerMacroOutput,
  MidiControllerModifierDefinition,
} from './controllerSurfaceTypes';

export type MidiControllerGesturePhase = 'down' | 'up' | 'value';

export type MidiControllerGestureEvent = {
  controlID: string;
  phase: MidiControllerGesturePhase;
  timestamp: number;
  value?: number;
};

export type MidiControllerMacroFire = {
  macroID: string;
  label: string;
  outputs: readonly MidiControllerMacroOutput[];
};

export type MidiControllerMacroRuntimeState = {
  pressed: Record<string, number>;
  activeLayers: Record<string, boolean>;
  toggledModifiers: Record<string, boolean>;
};

export type MidiControllerMacroProcessResult = {
  state: MidiControllerMacroRuntimeState;
  activeLayerIDs: readonly string[];
  fires: readonly MidiControllerMacroFire[];
  consumedControlIDs: readonly string[];
};

export function createMidiControllerMacroRuntimeState(): MidiControllerMacroRuntimeState {
  return {
    pressed: {},
    activeLayers: {},
    toggledModifiers: {},
  };
}

function withGesture(
  state: MidiControllerMacroRuntimeState,
  event: MidiControllerGestureEvent,
): MidiControllerMacroRuntimeState {
  const pressed = { ...state.pressed };
  if (event.phase === 'down') pressed[event.controlID] = event.timestamp;
  if (event.phase === 'up') delete pressed[event.controlID];
  return { ...state, pressed };
}

function applyModifier(
  state: MidiControllerMacroRuntimeState,
  modifier: MidiControllerModifierDefinition,
  event: MidiControllerGestureEvent,
): MidiControllerMacroRuntimeState {
  if (event.controlID !== modifier.controlID) return state;

  if (modifier.mode === 'hold') {
    if (event.phase === 'value') return state;
    return {
      ...state,
      activeLayers: {
        ...state.activeLayers,
        [modifier.layerID]: event.phase === 'down',
      },
    };
  }

  if (modifier.mode === 'toggle' && event.phase === 'down') {
    const nextEnabled = !state.toggledModifiers[modifier.id];
    return {
      ...state,
      toggledModifiers: {
        ...state.toggledModifiers,
        [modifier.id]: nextEnabled,
      },
      activeLayers: {
        ...state.activeLayers,
        [modifier.layerID]: nextEnabled,
      },
    };
  }

  return state;
}

function chordMatches(
  macro: MidiControllerMacroDefinition,
  pressed: Record<string, number>,
  event: MidiControllerGestureEvent,
): boolean {
  if (macro.trigger.type !== 'chord' || event.phase !== 'down') return false;
  const ids = macro.trigger.controlIDs;
  if (ids.length < 2 || !ids.includes(event.controlID)) return false;
  const times = ids.map((id) => pressed[id]).filter((value): value is number => typeof value === 'number');
  if (times.length !== ids.length) return false;
  return Math.max(...times) - Math.min(...times) <= Math.max(0, macro.trigger.withinMs);
}

function modifiedControlMatches(
  macro: MidiControllerMacroDefinition,
  modifiers: readonly MidiControllerModifierDefinition[],
  state: MidiControllerMacroRuntimeState,
  event: MidiControllerGestureEvent,
): boolean {
  if (macro.trigger.type !== 'modified-control' || event.phase !== 'down') return false;
  if (macro.trigger.controlID !== event.controlID) return false;
  const modifier = modifiers.find((candidate) => candidate.id === macro.trigger.modifierID);
  return !!modifier && state.activeLayers[modifier.layerID] === true;
}

export function processMidiControllerGesture(
  previousState: MidiControllerMacroRuntimeState,
  event: MidiControllerGestureEvent,
  modifiers: readonly MidiControllerModifierDefinition[],
  macros: readonly MidiControllerMacroDefinition[],
): MidiControllerMacroProcessResult {
  let state = withGesture(previousState, event);
  const consumed = new Set<string>();

  for (const modifier of modifiers) {
    const beforeLayer = state.activeLayers[modifier.layerID] === true;
    state = applyModifier(state, modifier, event);
    const afterLayer = state.activeLayers[modifier.layerID] === true;
    if (modifier.consumeSource && event.controlID === modifier.controlID && beforeLayer !== afterLayer) {
      consumed.add(event.controlID);
    }
  }

  const fires = macros
    .filter((macro) => macro.enabled)
    .sort((left, right) => right.priority - left.priority)
    .flatMap((macro) => {
      const matched = chordMatches(macro, state.pressed, event)
        || modifiedControlMatches(macro, modifiers, state, event);
      if (!matched) return [];
      if (macro.consumeInputs) {
        if (macro.trigger.type === 'chord') {
          for (const controlID of macro.trigger.controlIDs) consumed.add(controlID);
        } else {
          consumed.add(macro.trigger.controlID);
          const modifier = modifiers.find((candidate) => candidate.id === macro.trigger.modifierID);
          if (modifier) consumed.add(modifier.controlID);
        }
      }
      return [{ macroID: macro.id, label: macro.label, outputs: macro.outputs } satisfies MidiControllerMacroFire];
    });

  return {
    state,
    activeLayerIDs: Object.entries(state.activeLayers)
      .filter(([, enabled]) => enabled)
      .map(([layerID]) => layerID),
    fires,
    consumedControlIDs: Array.from(consumed),
  };
}
