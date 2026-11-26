import {
  midiMessageToHarmonyCaptureEvent,
  type HarmonyMidiCaptureEvent,
} from '../../native/midi/midiLiveNoteAdapter';
import type { KesshoMidiMessage } from '../../native/midi/midiTypes';

const harmonyMidiCaptureListeners = new Set<(event: HarmonyMidiCaptureEvent) => void>();

/** Register the active chord-entry surface for hardware MIDI. */
export function subscribeHarmonyMidiCapture(listener: (event: HarmonyMidiCaptureEvent) => void): () => void {
  harmonyMidiCaptureListeners.add(listener);
  return () => harmonyMidiCaptureListeners.delete(listener);
}

/** Publish one normalized hardware MIDI event to the active chord-entry surface. */
export function publishHarmonyMidiCaptureFromMessage(message: KesshoMidiMessage): HarmonyMidiCaptureEvent | null {
  const event = midiMessageToHarmonyCaptureEvent(message);
  if (!event) return null;
  for (const listener of harmonyMidiCaptureListeners) listener(event);
  return event;
}
