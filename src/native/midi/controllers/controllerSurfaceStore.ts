import { isMidiMessageKind } from '../midiTypes';
import {
  controllerSlotKey,
  createControllerSurfaceState,
  type MidiControllerBindingSlot,
  type MidiControllerMacroDefinition,
  type MidiControllerManifest,
  type MidiControllerModifierDefinition,
  type MidiControllerSurfaceState,
} from './controllerSurfaceTypes';

const STORAGE_PREFIX = 'kessho.midiControllerSurface.v1';

function storageKey(manifestID: string): string {
  return `${STORAGE_PREFIX}.${manifestID}`;
}

function parseSlot(value: unknown): MidiControllerBindingSlot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<MidiControllerBindingSlot>;
  if (typeof record.controlID !== 'string' || typeof record.layerID !== 'string') return null;
  const sourceRecord = record.source;
  const source = sourceRecord && typeof sourceRecord === 'object' && isMidiMessageKind(sourceRecord.kind)
    ? {
      kind: sourceRecord.kind,
      channel: typeof sourceRecord.channel === 'number' ? sourceRecord.channel : null,
      number: typeof sourceRecord.number === 'number' ? sourceRecord.number : null,
    }
    : null;
  return {
    controlID: record.controlID,
    layerID: record.layerID,
    source,
    bindingID: typeof record.bindingID === 'string' ? record.bindingID : null,
  };
}

export function loadMidiControllerSurfaceState(manifest: MidiControllerManifest): MidiControllerSurfaceState {
  const fallback = createControllerSurfaceState(manifest);
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(manifest.id));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<MidiControllerSurfaceState>;
    if (parsed.version !== 1 || parsed.manifestID !== manifest.id) return fallback;

    const slots = { ...fallback.slots };
    if (parsed.slots && typeof parsed.slots === 'object') {
      for (const candidate of Object.values(parsed.slots)) {
        const slot = parseSlot(candidate);
        if (!slot) continue;
        slots[controllerSlotKey(slot.controlID, slot.layerID)] = slot;
      }
    }

    return {
      version: 1,
      manifestID: manifest.id,
      inputUniqueID: typeof parsed.inputUniqueID === 'number' ? parsed.inputUniqueID : null,
      inputName: typeof parsed.inputName === 'string' ? parsed.inputName : null,
      inputPersistentIdentity: typeof parsed.inputPersistentIdentity === 'string'
        ? parsed.inputPersistentIdentity
        : null,
      slots,
      modifiers: Array.isArray(parsed.modifiers)
        ? parsed.modifiers as MidiControllerModifierDefinition[]
        : [],
      macros: Array.isArray(parsed.macros)
        ? parsed.macros as MidiControllerMacroDefinition[]
        : [],
    };
  } catch {
    return fallback;
  }
}

export function saveMidiControllerSurfaceState(state: MidiControllerSurfaceState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(state.manifestID), JSON.stringify(state));
  } catch {
    // Optional controller metadata should never block MIDI routing.
  }
}
