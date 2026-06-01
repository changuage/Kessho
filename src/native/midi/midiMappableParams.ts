import {
  DEFAULT_STATE,
  getParamInfo,
  type SliderState,
} from '../../ui/state';
import type { KesshoMidiValueCurve } from './midiTypes';

export type MidiMappableParamKind =
  | 'continuous'
  | 'stepped'
  | 'boolean'
  | 'indexed';

export type MidiMappableParamGroup =
  | 'global'
  | 'source'
  | 'synth'
  | 'drum'
  | 'granular'
  | 'water'
  | 'earth'
  | 'routing'
  | 'delay'
  | 'reverb'
  | 'dynamics'
  | 'sequencer'
  | 'visualizer'
  | 'debug';

export type MidiMappableParam = {
  key: keyof SliderState;
  label: string;
  group: MidiMappableParamGroup;
  kind: MidiMappableParamKind;
  min: number;
  max: number;
  step?: number;
  defaultValue: number | boolean | string;
  defaultCurve: KesshoMidiValueCurve;
  isBipolar: boolean;
  isPerformanceSafe: boolean;
  isStructural: boolean;
};

const EXCLUDED_KEY_PATTERNS = [
  /preset/i,
  /pattern/i,
  /sequence/i,
  /stepEnabled/i,
  /stepOverrides/i,
  /Config/i,
  /Settings/i,
  /Theme/i,
  /Name/i,
  /ID$/,
];

const LABEL_OVERRIDES: Partial<Record<keyof SliderState, string>> = {
  masterVolume: 'Master Volume',
  synthLevel: 'Pad 1 Level',
  pad2Level: 'Pad 2 Level',
  lead1Level: 'Lead 1 Level',
  lead2Level: 'Lead 2 Level',
  pianoLevel: 'Piano Level',
  drumLevel: 'Drum Level',
  granularLevel: 'Granular Level',
  oceanSampleLevel: 'Waves Level',
  waterLevel: 'Water Level',
  reverbLevel: 'Reverb Level',
};

function labelFromKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^pad2/i, 'Pad 2')
    .replace(/^pad1/i, 'Pad 1')
    .replace(/^lead1/i, 'Lead 1')
    .replace(/^lead2/i, 'Lead 2')
    .replace(/^fx/i, 'FX')
    .replace(/\bHp\b/g, 'HP')
    .replace(/\bLp\b/g, 'LP')
    .replace(/\bBpm\b/g, 'BPM')
    .replace(/\bLfo\b/g, 'LFO');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function inferMidiParamGroup(key: keyof SliderState): MidiMappableParamGroup {
  const text = String(key);
  if (/debug|telemetry/i.test(text)) return 'debug';
  if (/visual/i.test(text)) return 'visualizer';
  if (/sequencer|euclid|transport|clock|phrase|swing|bpm|arp/i.test(text)) return 'sequencer';
  if (/drum|kick|sub|beep|membrane|noise|click|sidechain/i.test(text)) return 'drum';
  if (/granular|grain|freeze/i.test(text)) return 'granular';
  if (/water|ocean|surf|drop|bubble|turbulence/i.test(text)) return 'water';
  if (/bird|frog|insect|nature|earth/i.test(text)) return 'earth';
  if (/delay|duck|pingPong|warp|tapeHead/i.test(text)) return 'delay';
  if (/reverb|shimmer|room|size|damp/i.test(text)) return 'reverb';
  if (/dynamic|degrade|character|saturation|compress|makeup|threshold|ratio|knee/i.test(text)) return 'dynamics';
  if (/send|level|enabled|source|routing|pan|width/i.test(text)) return 'routing';
  if (/pad|lead|piano|synth|filter|cutoff|lfo|morph|timbre|glide|attack|decay|sustain|release/i.test(text)) return 'synth';
  return 'global';
}

function inferKind(key: keyof SliderState, min: number, max: number, step: number): MidiMappableParamKind {
  const defaultValue = DEFAULT_STATE[key];
  if (typeof defaultValue === 'boolean') return 'boolean';
  if (typeof defaultValue === 'string') return 'indexed';
  if (step >= 1 && max - min <= 128) return 'stepped';
  return 'continuous';
}

function defaultCurveFor(key: keyof SliderState, min: number, max: number): KesshoMidiValueCurve {
  const text = String(key).toLowerCase();
  if (min > 0 && /freq|cutoff|time|attack|decay|release|interval|duration|bpm/.test(text)) {
    return 'logarithmic';
  }
  if (/steps|count|rotation|division|preset|algorithm|mode|type/.test(text) || max - min <= 16) {
    return 'stepped';
  }
  return 'linear';
}

function isExcludedKey(key: keyof SliderState): boolean {
  const text = String(key);
  if (EXCLUDED_KEY_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const value = DEFAULT_STATE[key];
  return value == null || Array.isArray(value) || (typeof value === 'object' && value !== null);
}

export function getMidiMappableParams(): MidiMappableParam[] {
  return (Object.keys(DEFAULT_STATE) as Array<keyof SliderState>)
    .flatMap((key) => {
      if (isExcludedKey(key)) return [];
      const info = getParamInfo(key);
      if (!info) return [];
      const defaultValue = DEFAULT_STATE[key];
      if (
        typeof defaultValue !== 'number' &&
        typeof defaultValue !== 'boolean' &&
        typeof defaultValue !== 'string'
      ) {
        return [];
      }
      const step = Math.max(0, Number(info.step) || 0);
      const min = Number(info.min);
      const max = Number(info.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [];
      return [{
        key,
        label: LABEL_OVERRIDES[key] ?? labelFromKey(String(key)),
        group: inferMidiParamGroup(key),
        kind: inferKind(key, min, max, step),
        min,
        max,
        step,
        defaultValue,
        defaultCurve: defaultCurveFor(key, min, max),
        isBipolar: min < 0 && max > 0,
        isPerformanceSafe: !/seed|buffer|asset|sample|record|export|debug/i.test(String(key)),
        isStructural: false,
      }];
    })
    .sort((left, right) => left.group === right.group
      ? left.label.localeCompare(right.label)
      : left.group.localeCompare(right.group));
}

export const MIDI_MAPPABLE_PARAMS: readonly MidiMappableParam[] = getMidiMappableParams();

export function getMidiMappableParam(key: keyof SliderState): MidiMappableParam | null {
  return MIDI_MAPPABLE_PARAMS.find((param) => param.key === key) ?? null;
}

export function isMidiMappableParamKey(key: keyof SliderState | string): key is keyof SliderState {
  return MIDI_MAPPABLE_PARAMS.some((param) => param.key === key);
}
