import type {
  MidiControllerControlDefinition,
  MidiControllerManifest,
} from './controllerSurfaceTypes';

const lpd8Pads: MidiControllerControlDefinition[] = Array.from({ length: 8 }, (_, index) => ({
  id: `pad-${index + 1}`,
  label: `Pad ${index + 1}`,
  kind: 'pad',
  policy: 'hybrid',
  defaultBehavior: 'momentary',
  group: 'pads',
  index: index + 1,
  velocitySensitive: true,
  description: 'Learn the emitted note or CC. For parameter mappings, CC mode is preferred.',
}));

const lpd8Knobs: MidiControllerControlDefinition[] = Array.from({ length: 8 }, (_, index) => ({
  id: `knob-${index + 1}`,
  label: `K${index + 1}`,
  kind: 'knob',
  policy: 'mappable',
  defaultBehavior: 'continuous',
  group: 'knobs',
  index: index + 1,
}));

const lpd8LocalButtons: MidiControllerControlDefinition[] = [
  'SELECT',
  'BANK A/B',
  'FULL LEVEL',
  'NR CONFIG',
  'TAP TEMPO',
  'NOTE REPEAT',
].map((label, index) => ({
  id: `local-${index + 1}`,
  label,
  kind: 'system',
  policy: 'device-local',
  defaultBehavior: 'momentary',
  group: 'local',
  index: index + 1,
}));

export const AKAI_LPD8_WIRELESS_MANIFEST: MidiControllerManifest = {
  id: 'akai-lpd8-wireless',
  vendor: 'Akai Professional',
  model: 'LPD8 Wireless',
  displayName: 'Akai LPD8 Wireless',
  matcher: {
    namePatterns: [/lpd8/i, /akai.*lpd/i],
    manufacturerPatterns: [/akai/i],
    preferredTransports: ['bluetooth', 'usb'],
  },
  controls: [...lpd8Pads, ...lpd8Knobs, ...lpd8LocalButtons],
  layout: [
    { id: 'pads', label: 'Pads', controlIDs: lpd8Pads.map((control) => control.id), columns: 4 },
    { id: 'knobs', label: 'Knobs', controlIDs: lpd8Knobs.map((control) => control.id), columns: 4 },
    { id: 'local', label: 'Device controls', controlIDs: lpd8LocalButtons.map((control) => control.id), columns: 6 },
  ],
  notes: [
    'Pads may emit notes or CC depending on the hardware program.',
    'Device-local mode buttons are shown for orientation and are not assumed to emit host MIDI.',
  ],
};

const keyStepKeys: MidiControllerControlDefinition[] = Array.from({ length: 32 }, (_, index) => ({
  id: `key-${index + 1}`,
  label: `Key ${index + 1}`,
  kind: 'key',
  policy: 'performance',
  defaultBehavior: 'performance-note',
  group: 'keyboard',
  index: index + 1,
  velocitySensitive: true,
  description: 'Performance note input by default; not consumed by controller mappings.',
}));

const keyStepPerformanceControls: MidiControllerControlDefinition[] = [
  {
    id: 'pitch-strip',
    label: 'Pitch',
    kind: 'touch-strip',
    policy: 'hybrid',
    defaultBehavior: 'continuous',
    group: 'performance',
    sourceHints: [{ kind: 'pitchBend' }],
  },
  {
    id: 'mod-strip',
    label: 'Mod',
    kind: 'touch-strip',
    policy: 'hybrid',
    defaultBehavior: 'continuous',
    group: 'performance',
    sourceHints: [{ kind: 'controlChange', number: 1 }],
  },
  {
    id: 'sustain',
    label: 'Sustain Pedal',
    kind: 'pedal',
    policy: 'hybrid',
    defaultBehavior: 'momentary',
    group: 'performance',
    sourceHints: [{ kind: 'controlChange', number: 64 }],
  },
];

const keyStepLocalControls: MidiControllerControlDefinition[] = [
  ['shift', 'Shift', 'button'],
  ['octave-down', 'Oct -', 'button'],
  ['octave-up', 'Oct +', 'button'],
  ['hold', 'Hold', 'button'],
  ['record', 'Record', 'transport'],
  ['stop', 'Stop', 'transport'],
  ['play', 'Play / Pause', 'transport'],
  ['rate', 'Rate', 'knob'],
  ['time-division', 'Time Division', 'encoder'],
].map(([id, label, kind]) => ({
  id,
  label,
  kind: kind as MidiControllerControlDefinition['kind'],
  policy: 'device-local' as const,
  defaultBehavior: kind === 'knob' || kind === 'encoder' ? 'continuous' as const : 'momentary' as const,
  group: 'onboard',
  description: 'Shown in the controller visualizer. Kessho does not assume this local control emits observable MIDI.',
}));

export const ARTURIA_KEYSTEP_32_MANIFEST: MidiControllerManifest = {
  id: 'arturia-keystep-32',
  vendor: 'Arturia',
  model: 'KeyStep',
  displayName: 'Arturia KeyStep (32)',
  matcher: {
    namePatterns: [/keystep(?!.*pro)(?!.*37)/i, /arturia.*keystep/i],
    manufacturerPatterns: [/arturia/i],
    preferredTransports: ['usb'],
  },
  controls: [...keyStepKeys, ...keyStepPerformanceControls, ...keyStepLocalControls],
  layout: [
    { id: 'onboard', label: 'Sequencer / local controls', controlIDs: keyStepLocalControls.map((control) => control.id), columns: 5 },
    { id: 'performance', label: 'Performance', controlIDs: keyStepPerformanceControls.map((control) => control.id), columns: 3 },
    { id: 'keyboard', label: 'Keyboard', controlIDs: keyStepKeys.map((control) => control.id), columns: 16 },
  ],
  notes: [
    'The physical Shift button controls KeyStep secondary functions; Kessho does not rely on it as an emitted MIDI source.',
    'Any observable control can instead be designated as a logical Kessho Shift/modifier.',
    'Piano keys remain performance inputs unless the user explicitly opts into a hybrid mapping mode in a future editor.',
  ],
};

export const MIDI_CONTROLLER_MANIFESTS: readonly MidiControllerManifest[] = [
  AKAI_LPD8_WIRELESS_MANIFEST,
  ARTURIA_KEYSTEP_32_MANIFEST,
];

export function getMidiControllerManifest(id: string): MidiControllerManifest | null {
  return MIDI_CONTROLLER_MANIFESTS.find((manifest) => manifest.id === id) ?? null;
}
