export const STEM_RECORD_TRACK_IDS = [
  'pad1',
  'pad2',
  'lead1',
  'lead2',
  'piano',
  'drums',
  'granular',
  'waves',
  'water',
  'insects',
  'nature',
  'delayAOut',
  'delayBOut',
  'reverb',
] as const;

export type StemRecordTrackId = typeof STEM_RECORD_TRACK_IDS[number];
export type RecordTrackId = 'mix' | StemRecordTrackId;

export const STEM_RECORD_TRACK_LABELS: Record<StemRecordTrackId, string> = {
  pad1: 'Pad 1',
  pad2: 'Pad 2',
  lead1: 'Lead 1',
  lead2: 'Lead 2',
  piano: 'Piano',
  drums: 'Drums',
  granular: 'Granular',
  waves: 'Waves',
  water: 'Water',
  insects: 'Insects',
  nature: 'Nature',
  delayAOut: 'Delay A',
  delayBOut: 'Delay B',
  reverb: 'Reverb',
};

export const STEM_RECORD_DEFAULTS: Record<StemRecordTrackId, boolean> = {
  pad1: false,
  pad2: false,
  lead1: false,
  lead2: false,
  piano: false,
  drums: false,
  granular: false,
  waves: false,
  water: false,
  insects: false,
  nature: false,
  delayAOut: false,
  delayBOut: false,
  reverb: false,
};

export const RECORD_TRACK_FILENAME_SUFFIX: Record<RecordTrackId, string> = {
  mix: '',
  pad1: 'pad-1',
  pad2: 'pad-2',
  lead1: 'lead-1',
  lead2: 'lead-2',
  piano: 'piano',
  drums: 'drums',
  granular: 'granular',
  waves: 'waves',
  water: 'water',
  insects: 'insects',
  nature: 'nature',
  delayAOut: 'delay-a',
  delayBOut: 'delay-b',
  reverb: 'reverb',
};
