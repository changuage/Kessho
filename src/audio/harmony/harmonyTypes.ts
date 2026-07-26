/** Harmony domain types shared by authored state, UI projections, and runtime adapters. */
export type HarmonyControlSource =
  | 'baseline'
  | 'sequence'
  | 'slot'
  | 'manualControl'
  | 'audition'
  | 'presetMorph';
export type HarmonyControlStrength = 'bias' | 'force';
export type HarmonyRootMode = 'degree' | 'absolute' | 'captured';
export type HarmonyChordQuality =
  | 'auto' | 'dim' | 'min' | 'maj' | 'sus' | 'maj7' | 'min7' | 'dom7'
  | 'add9' | 'six' | 'sixNine' | 'nine' | 'quartal' | 'cluster' | 'custom';
export type HarmonyChordExtension =
  | '6' | '7' | 'maj7' | '9' | '11' | '13' | 'six' | 'min7' | 'dom7'
  | 'add9' | 'nine' | 'sixNine';
export type HarmonyChordAlteration = 'b5' | '#5' | 'b9' | '#9' | '#11' | 'b13' | 'omit3' | 'omit5';
export type HarmonyBassMode = 'off' | 'root' | 'fifth' | 'captured';
export type HarmonySequenceStepMode = 'auto' | 'intent' | 'slotCopy' | 'slotFollow';
export type ManualHarmonyControlMode = 'audition' | 'control' | 'capture';

/** Canonical global Harmony progression.  Events are deliberately tiny so
 * they can be copied into Product Core's fixed-size snapshot without heap
 * work on the audio thread. */
export type HarmonyProgressionDurationUnit = 'bar' | 'phrase';
export type HarmonyProgressionDurationValue = 1 | 2 | 4 | 8;
export type HarmonyProgressionEventSource =
  | { type: 'auto' }
  | { type: 'slot'; slotId: number };
export interface HarmonyProgressionEvent {
  id: string;
  source: HarmonyProgressionEventSource;
  duration: {
    unit: HarmonyProgressionDurationUnit;
    value: HarmonyProgressionDurationValue;
  };
}
export interface HarmonyProgression {
  version: 1;
  enabled: boolean;
  events: HarmonyProgressionEvent[];
  currentEventIndex: number;
}

export interface HarmonyIntent {
  source: HarmonyControlSource;
  strength: HarmonyControlStrength;
  rootMode: HarmonyRootMode;
  degree: number;
  rootNote: number;
  quality: HarmonyChordQuality;
  extensions: string[];
  alterations?: HarmonyChordAlteration[];
  inversion: number;
  spread: number;
  octave: number;
  bassMode: HarmonyBassMode;
  bassNote: number | null;
  capturedMidiNotes: number[];
  preserveCapturedVoicing: boolean;
}

export interface HarmonyRecognitionVoicing {
  bassMidi: number;
  inversion: number;
  doubledPitchClasses: number[];
  omittedChordTones: string[];
  spread: number;
}

export interface HarmonyRecognitionCandidate {
  intent: HarmonyIntent;
  label: string;
  quality: HarmonyChordQuality;
  extensions: HarmonyChordExtension[];
  confidence: number;
  pitchClassScore: number;
  contextScore: number;
  voicing: HarmonyRecognitionVoicing;
}

export type HarmonyPlaybackBehavior = 'auto' | 'relative' | 'exact';
export type HarmonyIntentSource = 'inferred' | 'confirmed' | null;

export interface HarmonyCapturedContext {
  /** Continuous MIDI root anchor at capture time (not a pitch class). */
  rootMidi: number;
  /** Alias accepted by migrated payloads and useful to callers that name it explicitly. */
  rootMidiAnchor?: number;
  scaleId: number;
  capturedAt?: number;
}

export interface SharedHarmonyChord {
  intent: HarmonyIntent | null;
  intentSource: HarmonyIntentSource;
  exactMidiNotes: number[];
  recognizedLabel: string;
  playbackBehavior: HarmonyPlaybackBehavior;
  capturedContext: HarmonyCapturedContext;
  /** Ranked semantic interpretations retained for mismatch/adopt UI. */
  recognitionCandidates?: HarmonyRecognitionCandidate[];
  /** True when an exact edit diverges from a confirmed semantic intent. */
  recognitionMismatch?: boolean;
  /** Relative/Auto custom voicings need an explicit semantic choice first. */
  requiresSemanticSelection?: boolean;
}

export interface SharedHarmonyChordSlot {
  id: number;
  name: string;
  chord: SharedHarmonyChord | null;
  locked: boolean;
}

/** Legacy Harmony slot shape retained while consumers migrate to `chord`. */
export interface HarmonyChordSlot {
  id: number;
  name: string;
  intent: HarmonyIntent;
  chord: SharedHarmonyChord | null;
  locked: boolean;
}

export interface HarmonySequenceStep {
  id: number;
  enabled: boolean;
  locked: boolean;
  mode: HarmonySequenceStepMode;
  degree: number;
  quality: HarmonyChordQuality;
  intent: HarmonyIntent | null;
  slotId: number | null;
  probability: number;
}

export interface ManualHarmonyControlState {
  enabled: boolean;
  mode: ManualHarmonyControlMode;
  strength: HarmonyControlStrength;
  selectedRootNote: number;
  selectedDegree: number;
  selectedQuality: HarmonyChordQuality;
  selectedExtensions: string[];
  selectedOctave: number;
  selectedInversion: number;
  selectedSpread: number;
  selectedBassMode: HarmonyBassMode;
  activeIntent: HarmonyIntent | null;
  auditionIntent: HarmonyIntent | null;
  slotTriggerMode: boolean;
  activeSlotId: number | null;
}

export interface ResolvedHarmonyFrame {
  activeSource: HarmonyControlSource;
  activeStepIndex: number | null;
  activeSlotId: number | null;
  rootMidi: number;
  effectiveRootMidiAnchor: number;
  scaleId: number;
  degree: number;
  quality: HarmonyChordQuality;
  currentNotePool: number[];
  bassNote: number | null;
  nextNotePool: number[];
  nextSource: HarmonyControlSource | null;
  nextStepIndex: number | null;
  morphPercent: number;
  manualControlAvailable: boolean;
}

export interface L4HarmonyStateExtension {
  manualControl: ManualHarmonyControlState;
  chordSlots: HarmonyChordSlot[];
  chordSequence: HarmonySequenceStep[];
  chordSequenceEnabled: boolean;
  chordSequenceLength: number;
  chordSequenceStepIndex: number;
  resolvedHarmonyFrame: ResolvedHarmonyFrame;
  /** Canonical progression; legacy chordSequence is a compatibility view. */
  progression: HarmonyProgression;
}

export interface HarmonyDraftChord {
  intent: HarmonyIntent | null;
  intentSource?: HarmonyIntentSource;
  exactMidiNotes: number[];
  semanticCandidates?: Array<{ intent: HarmonyIntent; confidence: number }>;
  recognitionCandidates?: HarmonyRecognitionCandidate[];
  recognitionMismatch?: boolean;
  requiresSemanticSelection?: boolean;
  quality?: HarmonyChordQuality | null;
  extensions?: HarmonyChordExtension[];
  playbackBehavior: HarmonyPlaybackBehavior;
  capturedContext: HarmonyCapturedContext;
  recognizedLabel: string;
  editFocus: 'semantic' | 'exact' | null;
  source?: 'qwerty' | 'midi' | 'onscreen' | 'manualVoicing' | 'matrix' | 'suggestion' | 'slot';
  dirty?: boolean;
}

export type HarmonySemanticRoot = Pick<HarmonyIntent, 'rootMode' | 'degree' | 'rootNote'> & {
  rootMode: HarmonyRootMode;
};
