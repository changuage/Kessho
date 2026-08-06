import {
  midiMessageToHarmonyCaptureEvent,
  type HarmonyMidiCaptureEvent,
} from '../../native/midi/midiLiveNoteAdapter';
import type { KesshoMidiMessage } from '../../native/midi/midiTypes';
import { publishHarmonyMidiCapture } from '../harmony/harmonyDraftChord';

/** Publish one normalized hardware MIDI event to the active Harmony Draft capture. */
export function publishHarmonyMidiCaptureFromMessage(message: KesshoMidiMessage): HarmonyMidiCaptureEvent | null {
  const event = midiMessageToHarmonyCaptureEvent(message);
  if (!event) return null;
  publishHarmonyMidiCapture(event);
  return event;
}
