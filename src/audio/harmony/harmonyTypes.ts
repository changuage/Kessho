/** Harmony domain types shared by authored state, UI projections, and runtime adapters. */
import type { Chord } from './chord';

export type HarmonyControlSource =
  | 'baseline'
  | 'sequence'
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
export type ManualHarmonyControlMode = 'audition' | 'control' | 'capture';

/** Canonical global Harmony progression.  Events are deliberately tiny so
 * they can be copied into Product Core's fixed-size snapshot without heap
 * work on the audio thread. */
export type HarmonyProgressionDurationUnit = 'bar' | 'phrase';
export type HarmonyProgressionDurationValue = 1 | 2 | 4 | 8;
export type HarmonyProgressionEventSource =
  | { type: 'auto' }
  | { type: 'chord'; chord: Chord };
export interface HarmonyProgressionEvent {
  id: string;
  source: HarmonyProgressionEventSource;
  duration: {
    unit: HarmonyProgressionDurationUnit;
    value: HarmonyProgressionDurationValue;
  };
}
export interface HarmonyProgression {
  version: 2;
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
}

export interface ResolvedHarmonyFrame {
  activeSource: HarmonyControlSource;
  activeStepIndex: number | null;
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
  resolvedHarmonyFrame: ResolvedHarmonyFrame;
  progression: HarmonyProgression;
}
