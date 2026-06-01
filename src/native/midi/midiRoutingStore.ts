import {
  MIDI_ROUTING_PROFILE_V1_KEY,
  MIDI_ROUTING_PROFILE_V2_KEY,
  createEmptyMidiRoutingProfileV2,
  migrateMidiRoutingProfileV1ToV2,
  parseMidiRoutingProfileV1,
  parseMidiRoutingProfileV2,
  type KesshoMidiRoutingProfileV2,
} from './midiRoutingProfile';

export function loadKesshoMidiRoutingProfileV2(): KesshoMidiRoutingProfileV2 {
  if (typeof window === 'undefined') return createEmptyMidiRoutingProfileV2();

  try {
    const rawV2 = window.localStorage.getItem(MIDI_ROUTING_PROFILE_V2_KEY);
    if (rawV2) {
      const parsedV2 = parseMidiRoutingProfileV2(JSON.parse(rawV2));
      if (parsedV2) return parsedV2;
    }

    const rawV1 = window.localStorage.getItem(MIDI_ROUTING_PROFILE_V1_KEY);
    if (rawV1) {
      const parsedV1 = parseMidiRoutingProfileV1(JSON.parse(rawV1));
      if (parsedV1) {
        const migrated = migrateMidiRoutingProfileV1ToV2(parsedV1);
        saveKesshoMidiRoutingProfileV2(migrated);
        return migrated;
      }
    }
  } catch {
    return createEmptyMidiRoutingProfileV2();
  }

  return createEmptyMidiRoutingProfileV2();
}

export function saveKesshoMidiRoutingProfileV2(profile: KesshoMidiRoutingProfileV2): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MIDI_ROUTING_PROFILE_V2_KEY, JSON.stringify(profile));
  } catch {
    // Runtime MIDI routing should continue even if profile persistence is blocked.
  }
}
