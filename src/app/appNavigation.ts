import type { CSSProperties } from 'react';
import { SOURCE_COLORS } from '../designSystem/colors';
import { APP_TAB_SYMBOLS } from '../designSystem/textSymbols';
export { isEditableShortcutTarget } from '../ui/keyboard/keyboardTargets';

export type AdvancedTab = 'global' | 'visualizer' | 'synth' | 'drums' | 'reverb' | 'granular' | 'earth' | 'delay' | 'texture' | 'routing';
export type AdvancedEditorTab = Exclude<AdvancedTab, 'visualizer'>;
export type TopLevelShortcutTarget = 'snowflake' | 'journey';

export const ADVANCED_TAB_COLORS: Record<AdvancedTab, string> = {
  global: SOURCE_COLORS.global,
  visualizer: SOURCE_COLORS.visualizer,
  synth: SOURCE_COLORS.synth,
  drums: SOURCE_COLORS.drums,
  reverb: SOURCE_COLORS.reverb,
  granular: SOURCE_COLORS.granular,
  earth: SOURCE_COLORS.earth,
  delay: SOURCE_COLORS.delayA,
  texture: SOURCE_COLORS.dynamics,
  routing: SOURCE_COLORS.routing,
};

export const ADVANCED_EDITOR_TABS = [
  { id: 'routing', helpKey: 'tabRouting', symbol: APP_TAB_SYMBOLS.routing, label: 'Patch' },
  { id: 'synth', helpKey: 'tabSynth', symbol: APP_TAB_SYMBOLS.synth, label: 'Synth' },
  { id: 'drums', helpKey: 'tabDrums', symbol: APP_TAB_SYMBOLS.drums, label: 'Drums' },
  { id: 'earth', helpKey: 'tabEarth', symbol: APP_TAB_SYMBOLS.earth, label: 'Earth' },
  { id: 'granular', helpKey: 'tabGranular', symbol: APP_TAB_SYMBOLS.granular, label: 'Granular' },
  { id: 'delay', helpKey: 'tabDelay', symbol: APP_TAB_SYMBOLS.delay, label: 'Delay' },
  { id: 'reverb', helpKey: 'tabReverb', symbol: APP_TAB_SYMBOLS.reverb, label: 'Reverb' },
  { id: 'texture', helpKey: 'tabDynamics', symbol: APP_TAB_SYMBOLS.dynamics, label: 'Texture' },
  { id: 'global', helpKey: 'tabGlobal', symbol: APP_TAB_SYMBOLS.global, label: 'Global' },
] as const satisfies readonly {
  id: AdvancedEditorTab;
  helpKey: string;
  symbol: string;
  label: string;
}[];

export const getAdvancedTabActiveStyle = (accent: string): CSSProperties => ({
  background: `color-mix(in srgb, ${accent} 15%, transparent)`,
  color: `color-mix(in srgb, ${accent} 88%, white 12%)`,
  border: `1px solid color-mix(in srgb, ${accent} 34%, rgba(255, 255, 255, 0.08))`,
  boxShadow: `0 0 14px color-mix(in srgb, ${accent} 18%, transparent)`,
});

export const ADVANCED_TAB_SHORTCUTS: Record<string, AdvancedTab> = {
  '1': 'routing',
  '2': 'synth',
  '3': 'drums',
  '4': 'earth',
  '5': 'granular',
  '6': 'delay',
  '7': 'reverb',
  '8': 'texture',
  '9': 'global',
};

export const TOP_LEVEL_SHORTCUTS: Record<string, TopLevelShortcutTarget | AdvancedTab> = {
  '0': 'snowflake',
  Digit0: 'snowflake',
  '-': 'journey',
  Minus: 'journey',
  '=': 'visualizer',
  Equal: 'visualizer',
  '`': 'global',
  Backquote: 'global',
};

export const FX_BUS_LABELS = {
  delayA: 'Delay A',
  delayB: 'Delay B',
  granular: 'Granular',
  reverb: 'Reverb',
} as const;

export const FX_OWNER_LABELS = {
  pad1: 'Pad 1',
  pad2: 'Pad 2',
  lead1: 'Lead 1',
  lead2: 'Lead 2',
  sample1: 'Sample 1',
  sample2: 'Sample 2',
  piano: 'Piano',
  drum: 'Drums',
} as const;

export const FX_ORIGIN_LABELS = {
  padChord: 'Chord',
  padEuclid: 'Euclid',
  leadNote: 'Lead Note',
  sampleNote: 'Sample Note',
  pianoNote: 'Piano Note',
  drumHit: 'Drum Hit',
} as const;
