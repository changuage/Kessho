import React from 'react';
import type { SliderState, SavedPreset } from '../state';
import type { ProductEngineState } from '../../audio/product/ProductEngineTypes';
import type { TensionArcType } from '../../audio/harmony';
import type { PresetEntry, PresetVersionMetadata } from '../../presets/types';
import { PresetDropdown, PresetFamilyTree } from '../../presets';
import { extractOptimizedStatePresetData } from '../../presets/statePresetOptimization';
import type { SliderMode } from '../state';
import { SCALE_FAMILIES } from '../../audio/scales';
import { isAtEndpoint0, isAtEndpoint1 } from '../../audio/morphUtils';
import { getTransportMetrics } from '../../audio/transport';
import { STEM_RECORD_TRACK_IDS, STEM_RECORD_TRACK_LABELS } from '../../audio/recordingTracks';
import { DYNAMICS_ENGINE_COLORS, SOURCE_COLORS } from '../../designSystem/colors';
import { APP_TAB_SYMBOLS, TEXT_SYMBOLS } from '../../designSystem/textSymbols';
import { useSliderHelp } from '../SliderHelpOverlay';
import { getRuntimeSliderPosition } from '../runtimeSliderState';
import { useVisibleInterval } from '../hooks/useVisibleInterval';
import { GlobalRuntimeComparisonPanel, type GlobalRuntimeComparisonPanelProps } from './GlobalRuntimeComparisonPanel';
import './global.css';

// Note names for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DEGREE_LABELS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const GLOBAL_EXPANDED_SECTIONS_STORAGE_KEY = 'global:expanded-sections:v1';
const DEFAULT_GLOBAL_EXPANDED_SECTIONS = ['morph', 'state-presets', 'root-cof', 'chord-progression', 'scale-tension', 'transport-sync'];
type SceneHarmonyState = NonNullable<ProductEngineState['harmonyState']>;

function clamp01(value: number | undefined): number {
  return Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : 0));
}

function formatMorphPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const SCENE_SIGNAL_EPSILON = 0.001;
const SCENE_SIGNAL_VIEWBOX_WIDTH = 760;
const SCENE_SIGNAL_VIEWBOX_HEIGHT = 510;
const SCENE_SIGNAL_NODE_WIDTH = 160;
const SCENE_SIGNAL_NODE_LAYOUT_WIDTH = 168;
const SCENE_SIGNAL_NODE_LAYOUT_HEIGHT = 64;
const SCENE_SIGNAL_NODE_LAYOUT_GAP = 4;
const SCENE_SIGNAL_NODE_LAYOUT_LEFT_MARGIN = 92;
const SCENE_SIGNAL_NODE_LAYOUT_RIGHT_MARGIN = 84;
const SCENE_SIGNAL_MAIN_LAYOUT_BOTTOM = 378;
const SCENE_SIGNAL_MASTER_CHAIN_Y = 458;
const SCENE_SIGNAL_MASTER_CHAIN_X = [92, 284, 476, 668] as const;
const SCENE_SIGNAL_LAYOUT_PASSES = 24;
const SCENE_SIGNAL_POPOVER_WIDTH = 238;
const SCENE_SIGNAL_POPOVER_MARGIN = 12;
const SCENE_SIGNAL_RUNTIME_POLL_MS = 250;

type SceneSignalKind =
  | 'pad'
  | 'lead'
  | 'piano'
  | 'drum'
  | 'earth'
  | 'grain'
  | 'delay'
  | 'reverb'
  | 'freeze'
  | 'character'
  | 'degrade'
  | 'saturation'
  | 'end';

type SceneSignalNode = {
  id: string;
  label: string;
  kind: SceneSignalKind;
  role: 'sound' | 'fx' | 'master';
  x: number;
  y: number;
  level: number;
  rgb: string;
};

type SceneSignalSend = {
  id: string;
  from: SceneSignalNode;
  to: SceneSignalNode;
  amount: number;
  rgb: string;
  hidden?: boolean;
  lane?: 'fx' | 'master';
};

type SceneSignalSendOptions = Pick<SceneSignalSend, 'hidden' | 'lane'> & {
  force?: boolean;
};

type SceneSignalModel = {
  nodes: SceneSignalNode[];
  sends: SceneSignalSend[];
};

type SceneSourceSpec = SceneSignalNode & {
  sends: {
    delayA: number;
    delayB: number;
    granular: number;
    reverb: number;
  };
};

const SCENE_SIGNAL_POSITIONS: Record<string, { x: number; y: number }> = {
  pad1: { x: 92, y: 52 },
  pad2: { x: 92, y: 120 },
  lead1: { x: 92, y: 188 },
  lead2: { x: 92, y: 256 },
  piano: { x: 92, y: 324 },
  drums: { x: 248, y: 72 },
  waves: { x: 248, y: 140 },
  water: { x: 248, y: 208 },
  nature: { x: 248, y: 276 },
  insects: { x: 248, y: 344 },
  granular: { x: 412, y: 88 },
  freeze: { x: 412, y: 286 },
  degrade: { x: 412, y: 354 },
  delayA: { x: 552, y: 68 },
  delayB: { x: 552, y: 174 },
  saturation: { x: 552, y: 326 },
  reverb: { x: 674, y: 150 },
  masterCharacter: { x: 92, y: 458 },
  masterDegrade: { x: 284, y: 458 },
  masterSaturation: { x: 476, y: 458 },
  masterEnd: { x: 668, y: 458 },
};

function hexToRgbTriplet(hex: string): string {
  const raw = hex.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((char) => `${char}${char}`).join('') : raw;
  const value = Number.parseInt(full, 16);
  if (full.length !== 6 || !Number.isFinite(value)) return '232, 220, 196';
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

const SCENE_SIGNAL_RGB = {
  pad1: hexToRgbTriplet(SOURCE_COLORS.pad1),
  pad2: hexToRgbTriplet(SOURCE_COLORS.pad2),
  lead1: hexToRgbTriplet(SOURCE_COLORS.lead1),
  lead2: hexToRgbTriplet(SOURCE_COLORS.lead2),
  piano: hexToRgbTriplet(SOURCE_COLORS.piano),
  drums: hexToRgbTriplet(SOURCE_COLORS.drums),
  waves: hexToRgbTriplet(SOURCE_COLORS.waves),
  water: hexToRgbTriplet(SOURCE_COLORS.water),
  nature: hexToRgbTriplet(SOURCE_COLORS.nature),
  insects: hexToRgbTriplet(SOURCE_COLORS.insects),
  granular: hexToRgbTriplet(SOURCE_COLORS.granular),
  delayA: hexToRgbTriplet(SOURCE_COLORS.delayA),
  delayB: hexToRgbTriplet(SOURCE_COLORS.delayB),
  reverb: hexToRgbTriplet(SOURCE_COLORS.reverb),
  freeze: hexToRgbTriplet(DYNAMICS_ENGINE_COLORS.sidechain),
  character: hexToRgbTriplet(DYNAMICS_ENGINE_COLORS.character),
  degrade: hexToRgbTriplet(DYNAMICS_ENGINE_COLORS.degrade),
  saturation: hexToRgbTriplet(DYNAMICS_ENGINE_COLORS.saturation),
  end: hexToRgbTriplet(DYNAMICS_ENGINE_COLORS.endChain),
} as const;

const SCENE_SIGNAL_SYMBOLS: Record<SceneSignalKind, string> = {
  pad: APP_TAB_SYMBOLS.synth,
  lead: APP_TAB_SYMBOLS.synth,
  piano: APP_TAB_SYMBOLS.synth,
  drum: APP_TAB_SYMBOLS.drums,
  earth: APP_TAB_SYMBOLS.earth,
  grain: APP_TAB_SYMBOLS.granular,
  delay: APP_TAB_SYMBOLS.delay,
  reverb: APP_TAB_SYMBOLS.reverb,
  freeze: TEXT_SYMBOLS.sparkle,
  character: APP_TAB_SYMBOLS.dynamics,
  degrade: APP_TAB_SYMBOLS.dynamics,
  saturation: TEXT_SYMBOLS.filledCircle,
  end: APP_TAB_SYMBOLS.dynamics,
};

const SCENE_SIGNAL_RUNTIME_KEYS = [
  'synthLevel',
  'pad1DelayASend',
  'pad1DelayBSend',
  'granularPad1Send',
  'pad1ReverbSend',
  'pad2Level',
  'pad2DelayASend',
  'pad2DelayBSend',
  'granularPad2Send',
  'pad2ReverbSend',
  'lead1Level',
  'lead1DelayASend',
  'lead1DelayBSend',
  'granularLead1Send',
  'lead1ReverbSend',
  'lead2Level',
  'lead2DelayASend',
  'lead2DelayBSend',
  'granularLead2Send',
  'lead2ReverbSend',
  'pianoLevel',
  'pianoDelayASend',
  'pianoDelayBSend',
  'granularPianoSend',
  'pianoReverbSend',
  'drumLevel',
  'drumDelayASend',
  'drumDelayBSend',
  'granularDrumSend',
  'drumReverbSend',
  'earthLevel',
  'oceanSampleLevel',
  'oceanDelayASend',
  'oceanDelayBSend',
  'granularWavesSend',
  'oceanReverbSend',
  'waterLevel',
  'waterDelayASend',
  'waterDelayBSend',
  'granularWaterSend',
  'waterReverbSend',
  'natureLevel',
  'birdsLevel',
  'birds2Level',
  'frogsLevel',
  'natureDelayASend',
  'natureDelayBSend',
  'granularNatureSend',
  'natureReverbSend',
  'insectsSharedLevel',
  'insectsLevel',
  'insects2Level',
  'insDelayASend',
  'insDelayBSend',
  'granularInsectsSend',
  'insectsReverbSend',
  'granularLevel',
  'granularDelayASend',
  'granularDelayBSend',
  'granularReverbSend',
  'delayAMix',
  'delayAToBSend',
  'delayAGranularSend',
  'delayAReverbSend',
  'granularDelayMix',
  'delayBToASend',
  'delayBGranularSend',
  'granularDelayReverbSend',
  'spectralFreezeMix',
  'sidechainAmount',
  'characterMix',
  'degradeMix',
  'degradeAge',
  'degradeGeneration',
  'degradeSaturation',
  'dynamicsSaturationDrive',
  'endCompMix',
] as const satisfies readonly (keyof SliderState)[];

function hasSceneLevel(value: number): boolean {
  return clamp01(value) > SCENE_SIGNAL_EPSILON;
}

function scenePercent(level: number): string {
  return `${Math.round(clamp01(level) * 100)}`;
}

function pitchClass(note: number | undefined): number {
  return ((Math.round(note ?? 0) % 12) + 12) % 12;
}

function formatSceneSeconds(value: number | null | undefined, prefix = ''): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${prefix}${Math.max(0, value).toFixed(1)}s`;
}

function getSceneChordRootPc(harmonyState: SceneHarmonyState | null | undefined, fallbackRoot: number): number {
  const degree = harmonyState?.scaleFamily.degrees?.[harmonyState.currentDegree];
  return pitchClass((harmonyState?.effectiveRoot ?? fallbackRoot) + (degree?.root ?? 0));
}

function formatSceneChordNotes(notes: number[] | undefined, rootPc: number): string | null {
  if (!notes?.length) return null;
  const seen = new Set<number>();
  const pitchClasses = notes
    .map(pitchClass)
    .filter((pc) => {
      if (seen.has(pc)) return false;
      seen.add(pc);
      return true;
    })
    .sort((a, b) => ((a - rootPc + 12) % 12) - ((b - rootPc + 12) % 12));

  return pitchClasses.length ? pitchClasses.map((pc) => NOTE_NAMES[pc]).join(' ') : null;
}

function formatSceneChordName(harmonyState: SceneHarmonyState | null | undefined, fallbackRoot: number): string | null {
  const notes = harmonyState?.currentChord.midiNotes;
  if (!notes?.length) return null;

  const rootPc = getSceneChordRootPc(harmonyState, fallbackRoot);
  const rootLabel = NOTE_NAMES[rootPc] ?? 'C';
  const intervals = new Set(notes.map((note) => (pitchClass(note) - rootPc + 12) % 12));
  const degreeQuality = harmonyState?.scaleFamily.degrees?.[harmonyState.currentDegree]?.quality;
  const has = (interval: number) => intervals.has(interval);

  let suffix = '';
  if (degreeQuality === 'minor') {
    suffix = has(11) ? 'mMaj7' : has(10) ? 'm7' : 'm';
  } else if (degreeQuality === 'diminished') {
    suffix = has(10) ? 'm7b5' : has(9) ? 'dim7' : 'dim';
  } else if (degreeQuality === 'augmented') {
    suffix = has(11) ? 'augMaj7' : has(10) ? 'aug7' : 'aug';
  } else if (degreeQuality === 'dominant') {
    suffix = has(10) ? '7' : '';
  } else if (degreeQuality === 'major') {
    suffix = has(11) ? 'maj7' : '';
  } else if (has(3)) {
    suffix = has(11) ? 'mMaj7' : has(10) ? 'm7' : 'm';
  } else if (has(4)) {
    suffix = has(11) ? 'maj7' : has(10) ? '7' : '';
  }

  const extensions = [
    has(1) ? 'b9' : null,
    has(2) ? 'add9' : null,
    has(5) ? '11' : null,
    has(6) ? '#11' : null,
    has(8) ? 'b13' : null,
    has(9) && (has(10) || has(11)) ? '13' : null,
  ].filter(Boolean).join('');

  return `${rootLabel}${suffix}${extensions}`;
}

function nodeStyle(node: SceneSignalNode): React.CSSProperties {
  return {
    '--rgb': node.rgb,
    '--level': clamp01(node.level),
  } as React.CSSProperties;
}

function sendStyle(send: SceneSignalSend): React.CSSProperties {
  return {
    '--rgb': send.rgb,
    '--send': clamp01(send.amount),
  } as React.CSSProperties;
}

function sceneSignalPopoverStyle(point: { x: number; y: number; placement: 'top' | 'bottom' } | null): React.CSSProperties | undefined {
  if (!point) return undefined;
  return {
    left: point.x,
    top: point.y,
    '--scene-popover-transform': point.placement === 'top'
      ? 'translate(-50%, -100%) translateY(-12px)'
      : 'translate(-50%, 12px)',
  } as React.CSSProperties;
}

function sceneSendLabel(send: SceneSignalSend, selectedNodeId: string): string {
  return send.from.id === selectedNodeId
    ? `${send.from.label} → ${send.to.label}`
    : `${send.from.label} → ${send.to.label}`;
}

function getSceneRuntimeNumber(
  state: SliderState,
  key: keyof SliderState,
  sliderModes?: Record<string, SliderMode>,
  dualSliderRanges?: Record<string, { min: number; max: number }>,
): number | null {
  const keyString = String(key);
  const mode = sliderModes?.[keyString] ?? 'single';
  const range = dualSliderRanges?.[keyString];
  const authored = state[key];
  if (
    mode === 'single' ||
    !range ||
    typeof authored !== 'number' ||
    !Number.isFinite(authored)
  ) {
    return typeof authored === 'number' && Number.isFinite(authored) ? authored : null;
  }

  const min = Math.min(range.min, range.max);
  const max = Math.max(range.min, range.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 0.000001) return authored;

  const fallbackPosition = clamp01((authored - min) / (max - min));
  const runtimePosition = getRuntimeSliderPosition(keyString, mode) ?? fallbackPosition;
  return min + clamp01(runtimePosition) * (max - min);
}

function hasSceneRuntimeDualParams(
  sliderModes?: Record<string, SliderMode>,
  dualSliderRanges?: Record<string, { min: number; max: number }>,
): boolean {
  if (!sliderModes || !dualSliderRanges) return false;
  return SCENE_SIGNAL_RUNTIME_KEYS.some((key) => {
    const keyString = String(key);
    const mode = sliderModes[keyString] ?? 'single';
    return mode !== 'single' && !!dualSliderRanges[keyString];
  });
}

function createSceneRuntimeSignature(
  state: SliderState,
  sliderModes?: Record<string, SliderMode>,
  dualSliderRanges?: Record<string, { min: number; max: number }>,
): string {
  if (!hasSceneRuntimeDualParams(sliderModes, dualSliderRanges)) return '';
  return SCENE_SIGNAL_RUNTIME_KEYS.map((key) => {
    const keyString = String(key);
    const mode = sliderModes?.[keyString] ?? 'single';
    if (mode === 'single' || !dualSliderRanges?.[keyString]) return '';
    const value = getSceneRuntimeNumber(state, key, sliderModes, dualSliderRanges);
    return value === null ? '' : `${keyString}:${value.toFixed(4)}`;
  }).filter(Boolean).join('|');
}

function resolveSceneRuntimeState(
  state: SliderState,
  sliderModes?: Record<string, SliderMode>,
  dualSliderRanges?: Record<string, { min: number; max: number }>,
): SliderState {
  if (!hasSceneRuntimeDualParams(sliderModes, dualSliderRanges)) return state;

  let nextState: SliderState | null = null;
  for (const key of SCENE_SIGNAL_RUNTIME_KEYS) {
    const keyString = String(key);
    const mode = sliderModes?.[keyString] ?? 'single';
    if (mode === 'single' || !dualSliderRanges?.[keyString]) continue;
    const value = getSceneRuntimeNumber(state, key, sliderModes, dualSliderRanges);
    if (value === null || Object.is(value, state[key])) continue;
    nextState ??= { ...state };
    (nextState as unknown as Record<string, unknown>)[keyString] = value;
  }

  return nextState ?? state;
}

function createSceneNode(
  id: string,
  label: string,
  kind: SceneSignalKind,
  role: 'sound' | 'fx' | 'master',
  level: number,
  rgb: string,
): SceneSignalNode {
  const position = SCENE_SIGNAL_POSITIONS[id] ?? { x: 500, y: 205 };
  return {
    id,
    label,
    kind,
    role,
    x: position.x,
    y: position.y,
    level: clamp01(level),
    rgb,
  };
}

function createSceneSource(
  id: string,
  label: string,
  kind: SceneSignalKind,
  enabled: boolean,
  level: number,
  rgb: string,
  sends: SceneSourceSpec['sends'],
): SceneSourceSpec | null {
  const hasFxSend = (
    hasSceneLevel(sends.delayA) ||
    hasSceneLevel(sends.delayB) ||
    hasSceneLevel(sends.granular) ||
    hasSceneLevel(sends.reverb)
  );
  if (!enabled || (!hasSceneLevel(level) && !hasFxSend)) return null;
  return {
    ...createSceneNode(id, label, kind, 'sound', level, rgb),
    sends,
  };
}

function maxSend(sources: SceneSourceSpec[], key: keyof SceneSourceSpec['sends']): number {
  return sources.reduce((max, source) => Math.max(max, source.sends[key]), 0);
}

function sceneSendPath(from: SceneSignalNode, to: SceneSignalNode): string {
  const startX = from.x + SCENE_SIGNAL_NODE_WIDTH / 2 - 8;
  const endX = to.x - SCENE_SIGNAL_NODE_WIDTH / 2 - 4;
  const midX = (startX + endX) / 2;
  const lift = Math.min(58, Math.abs(to.y - from.y) * 0.24);
  return `M${startX} ${from.y} C${midX} ${from.y - lift} ${midX} ${to.y + lift} ${endX} ${to.y}`;
}

function clampSceneSignalLayoutNode(node: SceneSignalNode): void {
  const halfHeight = SCENE_SIGNAL_NODE_LAYOUT_HEIGHT / 2;
  node.x = Math.max(
    SCENE_SIGNAL_NODE_LAYOUT_LEFT_MARGIN,
    Math.min(SCENE_SIGNAL_VIEWBOX_WIDTH - SCENE_SIGNAL_NODE_LAYOUT_RIGHT_MARGIN, node.x),
  );
  node.y = Math.max(halfHeight, Math.min(SCENE_SIGNAL_MAIN_LAYOUT_BOTTOM, node.y));
}

function layoutSceneSignalModel(model: SceneSignalModel): SceneSignalModel {
  const unlockedNodes = model.nodes
    .filter((node) => node.role !== 'master')
    .map((node) => ({ ...node }));
  const lockedNodes = model.nodes
    .filter((node) => node.role === 'master')
    .map((node) => ({ ...node }));
  const minXDistance = SCENE_SIGNAL_NODE_LAYOUT_WIDTH + SCENE_SIGNAL_NODE_LAYOUT_GAP;
  const minYDistance = SCENE_SIGNAL_NODE_LAYOUT_HEIGHT + SCENE_SIGNAL_NODE_LAYOUT_GAP;

  unlockedNodes.forEach(clampSceneSignalLayoutNode);

  for (let pass = 0; pass < SCENE_SIGNAL_LAYOUT_PASSES; pass += 1) {
    for (let i = 0; i < unlockedNodes.length; i += 1) {
      for (let j = i + 1; j < unlockedNodes.length; j += 1) {
        const a = unlockedNodes[i];
        const b = unlockedNodes[j];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = minXDistance - Math.abs(dx);
        const overlapY = minYDistance - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const separateOnY = overlapY <= overlapX;
        const direction = separateOnY
          ? (dy === 0 ? (b.y >= a.y ? 1 : -1) : Math.sign(dy))
          : (dx === 0 ? (b.x >= a.x ? 1 : -1) : Math.sign(dx));
        const movement = (separateOnY ? overlapY : overlapX) / 2 + 0.5;

        if (separateOnY) {
          a.y -= direction * movement;
          b.y += direction * movement;
        } else {
          a.x -= direction * movement;
          b.x += direction * movement;
        }
        clampSceneSignalLayoutNode(a);
        clampSceneSignalLayoutNode(b);
      }
    }
  }

  const nodes = [...unlockedNodes, ...lockedNodes];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sends = model.sends.map((send) => ({
    ...send,
    from: byId.get(send.from.id) ?? send.from,
    to: byId.get(send.to.id) ?? send.to,
  }));
  return { nodes, sends };
}

function buildSceneSignalModel(state: SliderState): SceneSignalModel {
  const earthMaster = clamp01(state.earthLevel);
  const natureSourceLevel = Math.max(
    state.birdsEnabled ? clamp01(state.birdsLevel) : 0,
    state.birds2Enabled ? clamp01(state.birds2Level) : 0,
    state.frogsEnabled ? clamp01(state.frogsLevel) : 0,
  );
  const insectsSourceLevel = Math.max(
    state.insectsEnabled ? clamp01(state.insectsLevel) : 0,
    state.insects2Enabled ? clamp01(state.insects2Level) : 0,
  );

  const sources = [
    createSceneSource('pad1', 'Pad 1', 'pad', state.padEnabled !== false, state.synthLevel, SCENE_SIGNAL_RGB.pad1, {
      delayA: clamp01(state.pad1DelayASend),
      delayB: clamp01(state.pad1DelayBSend),
      granular: clamp01(state.granularPad1Send),
      reverb: clamp01(state.pad1ReverbSend),
    }),
    createSceneSource('pad2', 'Pad 2', 'pad', state.pad2Enabled, state.pad2Level, SCENE_SIGNAL_RGB.pad2, {
      delayA: clamp01(state.pad2DelayASend),
      delayB: clamp01(state.pad2DelayBSend),
      granular: clamp01(state.granularPad2Send),
      reverb: clamp01(state.pad2ReverbSend),
    }),
    createSceneSource('lead1', 'Lead 1', 'lead', state.leadEnabled, state.lead1Level, SCENE_SIGNAL_RGB.lead1, {
      delayA: clamp01(state.lead1DelayASend),
      delayB: clamp01(state.lead1DelayBSend),
      granular: clamp01(state.granularLead1Send),
      reverb: clamp01(state.lead1ReverbSend),
    }),
    createSceneSource('lead2', 'Lead 2', 'lead', state.lead2Enabled, state.lead2Level, SCENE_SIGNAL_RGB.lead2, {
      delayA: clamp01(state.lead2DelayASend),
      delayB: clamp01(state.lead2DelayBSend),
      granular: clamp01(state.granularLead2Send),
      reverb: clamp01(state.lead2ReverbSend),
    }),
    createSceneSource('piano', 'Piano', 'piano', state.pianoEnabled, state.pianoLevel, SCENE_SIGNAL_RGB.piano, {
      delayA: clamp01(state.pianoDelayASend),
      delayB: clamp01(state.pianoDelayBSend),
      granular: clamp01(state.granularPianoSend),
      reverb: clamp01(state.pianoReverbSend),
    }),
    createSceneSource('drums', 'Drums', 'drum', state.drumEnabled || state.drumEuclidMasterEnabled, state.drumLevel, SCENE_SIGNAL_RGB.drums, {
      delayA: clamp01(state.drumDelayASend),
      delayB: clamp01(state.drumDelayBSend),
      granular: clamp01(state.granularDrumSend),
      reverb: clamp01(state.drumReverbSend),
    }),
    createSceneSource('waves', 'Waves', 'earth', state.oceanSampleEnabled, earthMaster * clamp01(state.oceanSampleLevel), SCENE_SIGNAL_RGB.waves, {
      delayA: clamp01(state.oceanDelayASend),
      delayB: clamp01(state.oceanDelayBSend),
      granular: clamp01(state.granularWavesSend),
      reverb: clamp01(state.oceanReverbSend),
    }),
    createSceneSource('water', 'Water', 'earth', state.waterEnabled, earthMaster * clamp01(state.waterLevel), SCENE_SIGNAL_RGB.water, {
      delayA: clamp01(state.waterDelayASend),
      delayB: clamp01(state.waterDelayBSend),
      granular: clamp01(state.granularWaterSend),
      reverb: clamp01(state.waterReverbSend),
    }),
    createSceneSource('nature', 'Nature', 'earth', state.birdsEnabled || state.birds2Enabled || state.frogsEnabled, earthMaster * clamp01(state.natureLevel) * natureSourceLevel, SCENE_SIGNAL_RGB.nature, {
      delayA: clamp01(state.natureDelayASend),
      delayB: clamp01(state.natureDelayBSend),
      granular: clamp01(state.granularNatureSend),
      reverb: clamp01(state.natureReverbSend),
    }),
    createSceneSource('insects', 'Insects', 'earth', state.insectsEnabled || state.insects2Enabled, earthMaster * clamp01(state.insectsSharedLevel) * insectsSourceLevel, SCENE_SIGNAL_RGB.insects, {
      delayA: clamp01(state.insDelayASend),
      delayB: clamp01(state.insDelayBSend),
      granular: clamp01(state.granularInsectsSend),
      reverb: clamp01(state.insectsReverbSend),
    }),
  ].filter((source): source is SceneSourceSpec => source !== null);

  const sourceDelayAFeed = maxSend(sources, 'delayA');
  const sourceDelayBFeed = maxSend(sources, 'delayB');
  const sourceGranularFeed = maxSend(sources, 'granular');
  const sourceReverbFeed = maxSend(sources, 'reverb');
  const granularLevel = state.granularEnabled ? clamp01(state.granularLevel) : 0;
  const delayAActive = hasSceneLevel(state.delayAMix) && (
    hasSceneLevel(sourceDelayAFeed) ||
    hasSceneLevel(state.delayBToASend)
  );
  const delayBActive = !!state.granularDelayEnabled && hasSceneLevel(state.granularDelayMix) && (
    hasSceneLevel(sourceDelayBFeed) ||
    hasSceneLevel(state.delayAToBSend) ||
    hasSceneLevel(state.granularDelayBSend)
  );
  const granularActive = !!state.granularEnabled && (
    hasSceneLevel(granularLevel) ||
    hasSceneLevel(sourceGranularFeed) ||
    hasSceneLevel(state.delayAGranularSend) ||
    hasSceneLevel(state.delayBGranularSend)
  );
  const reverbActive = !!state.reverbEnabled && hasSceneLevel(state.reverbLevel) && (
    hasSceneLevel(sourceReverbFeed) ||
    (delayAActive && hasSceneLevel(state.delayAReverbSend)) ||
    (delayBActive && hasSceneLevel(state.granularDelayReverbSend)) ||
    (granularActive && hasSceneLevel(state.granularReverbSend))
  );
  const freezeActive = !!state.spectralFreezeEnabled && hasSceneLevel(state.spectralFreezeMix);
  const characterEnabled = !!state.dynamicsEnabled && !!state.characterEnabled;
  const degradeEnabled = !!state.dynamicsEnabled && !!state.degradeEnabled;
  const saturationEnabled = !!state.dynamicsSaturationEnabled;
  const endCompEnabled = !!state.dynamicsEnabled && !!state.endCompEnabled;
  const characterLevel = characterEnabled ? clamp01(state.characterMix) : 0;
  const degradeLevel = degradeEnabled
    ? Math.max(
        clamp01(state.degradeMix),
        clamp01(state.degradeAge),
        clamp01(state.degradeGeneration),
        clamp01(state.degradeSaturation),
      )
    : 0;
  const saturationLevel = saturationEnabled ? clamp01(state.dynamicsSaturationDrive) : 0;
  const endCompLevel = endCompEnabled ? clamp01(state.endCompMix ?? 1) : 0;

  const fxNodes = [
    granularActive ? createSceneNode('granular', 'Granular', 'grain', 'fx', Math.max(granularLevel, sourceGranularFeed), SCENE_SIGNAL_RGB.granular) : null,
    freezeActive ? createSceneNode('freeze', 'Freeze', 'freeze', 'fx', state.spectralFreezeMix, SCENE_SIGNAL_RGB.freeze) : null,
    delayAActive ? createSceneNode('delayA', 'Delay A', 'delay', 'fx', Math.max(clamp01(state.delayAMix), sourceDelayAFeed), SCENE_SIGNAL_RGB.delayA) : null,
    delayBActive ? createSceneNode('delayB', 'Delay B', 'delay', 'fx', Math.max(clamp01(state.granularDelayMix), sourceDelayBFeed), SCENE_SIGNAL_RGB.delayB) : null,
    reverbActive ? createSceneNode('reverb', 'Reverb', 'reverb', 'fx', Math.max(clamp01(state.reverbLevel), sourceReverbFeed), SCENE_SIGNAL_RGB.reverb) : null,
  ].filter((node): node is SceneSignalNode => node !== null);

  const masterInputNodes = [
    ...sources,
    ...fxNodes.filter((node) => node.id === 'granular' || node.id === 'delayA' || node.id === 'delayB' || node.id === 'reverb'),
  ];
  const masterChainActive = masterInputNodes.length > 0 && (
    characterEnabled ||
    degradeEnabled ||
    saturationEnabled ||
    endCompEnabled
  );
  const masterChainNodes = masterChainActive
    ? [
        characterEnabled
          ? createSceneNode('masterCharacter', 'Character', 'character', 'master', characterLevel, SCENE_SIGNAL_RGB.character)
          : null,
        degradeEnabled
          ? createSceneNode('masterDegrade', 'Degrade', 'degrade', 'master', degradeLevel, SCENE_SIGNAL_RGB.degrade)
          : null,
        saturationEnabled
          ? createSceneNode('masterSaturation', 'Saturation', 'saturation', 'master', saturationLevel, SCENE_SIGNAL_RGB.saturation)
          : null,
        endCompEnabled
          ? createSceneNode('masterEnd', 'End Comp', 'end', 'master', endCompLevel, SCENE_SIGNAL_RGB.end)
          : null,
      ]
        .filter((node): node is SceneSignalNode => node !== null)
        .map((node, index) => ({
          ...node,
          x: SCENE_SIGNAL_MASTER_CHAIN_X[index] ?? node.x,
          y: SCENE_SIGNAL_MASTER_CHAIN_Y,
        }))
    : [];

  const nodes = [...sources, ...fxNodes, ...masterChainNodes];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sends: SceneSignalSend[] = [];
  const addSend = (
    from: SceneSignalNode | undefined,
    toId: string,
    amount: number,
    rgb = from?.rgb,
    options: SceneSignalSendOptions = {},
  ) => {
    const { force = false, ...sendOptions } = options;
    const to = byId.get(toId);
    if (!from || !to || (!force && !hasSceneLevel(amount)) || !rgb) return;
    sends.push({
      id: `${from.id}-${to.id}`,
      from,
      to,
      amount: clamp01(amount),
      rgb,
      ...sendOptions,
    });
  };

  for (const source of sources) {
    addSend(source, 'delayA', source.sends.delayA);
    addSend(source, 'delayB', source.sends.delayB);
    addSend(source, 'granular', source.sends.granular);
    addSend(source, 'reverb', source.sends.reverb);
  }

  addSend(byId.get('granular'), 'delayA', state.granularDelayASend);
  addSend(byId.get('granular'), 'delayB', state.granularDelayBSend);
  addSend(byId.get('granular'), 'reverb', state.granularReverbSend);
  addSend(byId.get('delayA'), 'delayB', state.delayAToBSend);
  addSend(byId.get('delayA'), 'granular', state.delayAGranularSend);
  addSend(byId.get('delayA'), 'reverb', state.delayAReverbSend);
  addSend(byId.get('delayB'), 'delayA', state.delayBToASend);
  addSend(byId.get('delayB'), 'granular', state.delayBGranularSend);
  addSend(byId.get('delayB'), 'reverb', state.granularDelayReverbSend);
  addSend(byId.get('reverb'), 'freeze', freezeActive ? state.spectralFreezeMix : 0, SCENE_SIGNAL_RGB.reverb);

  if (masterChainActive) {
    const firstMasterProcessor = masterChainNodes[0];
    for (const input of masterInputNodes) {
      if (firstMasterProcessor) {
        addSend(input, firstMasterProcessor.id, input.level, input.rgb, { hidden: true, lane: 'master' });
      }
    }
    for (let index = 0; index < masterChainNodes.length - 1; index += 1) {
      const from = masterChainNodes[index];
      const to = masterChainNodes[index + 1];
      if (!from || !to) continue;
      addSend(from, to.id, Math.max(from.level, to.level), to.rgb, { lane: 'master', force: true });
    }
  }

  return layoutSceneSignalModel({ nodes, sends });
}

// ═══════════════ Props ═══════════════

export interface GlobalPageProps {
  state: SliderState;
  expandedPanels: Set<string>;
  togglePanel: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onParamChange: (key: any, value: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelectChange: (key: any, value: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sliderProps: (paramKey: any) => Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SliderComponent: React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SelectComponent: React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CircleOfFifthsComponent: React.ComponentType<any>;

  // Engine state
  engineState: ProductEngineState;
  runtimeComparison?: GlobalRuntimeComparisonPanelProps;
  onResetCofDrift: () => void;

  // Morph CoF visualization
  morphCoFViz: {
    cofStep: number;
    startRoot: number;
    targetRoot: number;
  } | null;

  // Morph state
  morphPresetA: SavedPreset | null;
  morphPresetB: SavedPreset | null;
  morphPosition: number;
  morphMode: 'manual' | 'auto';
  morphPlayPhrases: number;
  morphTransitionPhrases: number;
  morphCountdown: { phase: string; phrasesLeft: number } | null;
  onLoadMorphA: (entry: PresetEntry, data: Record<string, unknown>) => boolean | void | Promise<boolean | void>;
  morphSlotAName: string;
  onClearMorphA: () => void;
  onLoadMorphB: (entry: PresetEntry, data: Record<string, unknown>) => boolean | void | Promise<boolean | void>;
  morphSlotBName: string;
  onClearMorphB: () => void;
  onMorphPositionChange: (value: number) => void;
  onMorphModeChange: (mode: 'manual' | 'auto') => void;
  onMorphPlayPhrasesChange: (value: number) => void;
  onMorphTransitionPhrasesChange: (value: number) => void;

  // State preset
  statePresetName: string;

  // Recording
  isRecording: boolean;
  recordFormats: { webm: boolean; wav: boolean };
  recordStems: Record<string, boolean>;
  recordingAvailable: boolean;
  recordingDuration: number;
  stemRecordingAvailable: boolean;
  formatRecordingTime: (seconds: number) => string;
  onRecordFormatsChange: (updater: (prev: { webm: boolean; wav: boolean }) => { webm: boolean; wav: boolean }) => void;
  onRecordStemsChange: (key: string) => void;

  // Playback Timer
  playbackTimerEnabled: boolean;
  playbackTimerMinutes: number;
  playbackTimerRemaining: number | null;
  onTimerEnabledChange: (enabled: boolean) => void;
  onTimerMinutesChange: (minutes: number) => void;
  onTimerRemainingChange: (remaining: number) => void;

  // Dual slider state (for version diff comparison)
  sliderModes?: Record<string, SliderMode>;
  dualSliderRanges?: Record<string, { min: number; max: number }>;
  getStatePresetSaveMetadata?: () => PresetVersionMetadata | undefined;
}

// ═══════════════ Component ═══════════════

const GlobalPage: React.FC<GlobalPageProps> = ({
  state,
  onParamChange,
  onSelectChange,
  sliderProps,
  SliderComponent: Slider,
  SelectComponent: Select,
  CircleOfFifthsComponent: CircleOfFifths,
  engineState,
  runtimeComparison,
  onResetCofDrift,
  morphCoFViz,
  morphPresetA,
  morphPresetB,
  morphPosition,
  morphMode,
  morphPlayPhrases,
  morphTransitionPhrases,
  morphCountdown,
  onLoadMorphA,
  morphSlotAName,
  onClearMorphA,
  onLoadMorphB,
  morphSlotBName,
  onClearMorphB,
  onMorphPositionChange,
  onMorphModeChange,
  onMorphPlayPhrasesChange,
  onMorphTransitionPhrasesChange,
  statePresetName,
  isRecording,
  recordFormats,
  recordStems,
  recordingAvailable,
  recordingDuration,
  stemRecordingAvailable,
  formatRecordingTime,
  onRecordFormatsChange,
  onRecordStemsChange,
  playbackTimerEnabled,
  playbackTimerMinutes,
  playbackTimerRemaining,
  onTimerEnabledChange,
  onTimerMinutesChange,
  onTimerRemainingChange,
  sliderModes,
  dualSliderRanges,
  getStatePresetSaveMetadata,
}) => {
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
    () => {
      if (typeof window === 'undefined') return new Set(DEFAULT_GLOBAL_EXPANDED_SECTIONS);
      try {
        const raw = window.sessionStorage.getItem(GLOBAL_EXPANDED_SECTIONS_STORAGE_KEY);
        if (!raw) return new Set(DEFAULT_GLOBAL_EXPANDED_SECTIONS);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set(DEFAULT_GLOBAL_EXPANDED_SECTIONS);
        return new Set(parsed.filter((value): value is string => typeof value === 'string'));
      } catch {
        return new Set(DEFAULT_GLOBAL_EXPANDED_SECTIONS);
      }
    }
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(GLOBAL_EXPANDED_SECTIONS_STORAGE_KEY, JSON.stringify(Array.from(expandedSections)));
    } catch {
      // Ignore storage failures; section state can remain in-memory.
    }
  }, [expandedSections]);
  const { announceHelp } = useSliderHelp();
  const bindHelp = React.useCallback((helpKey: string, options: { label?: string } = {}) => ({
    onMouseEnter: () => announceHelp(helpKey, { ...options, page: 'global' }),
    onPointerDown: () => announceHelp(helpKey, { ...options, page: 'global' }),
    onFocus: () => announceHelp(helpKey, { ...options, page: 'global' }),
  }), [announceHelp]);
  const transportMetrics = React.useMemo(() => getTransportMetrics(state), [state]);
  const progressionSteps = Math.max(1, state.chordProgressionSteps ?? 4);
  const progressionStepEnabled = React.useMemo(
    () => (state.chordProgressionStepEnabled ?? [])
      .slice(0, progressionSteps)
      .concat(new Array(Math.max(0, progressionSteps - (state.chordProgressionStepEnabled?.length ?? 0))).fill(true)),
    [progressionSteps, state.chordProgressionStepEnabled],
  );
  const primaryClock = state.transportPrimaryClock ?? 'seconds';
  const isSecondsMaster = primaryClock === 'seconds';
  const isBpmMaster = primaryClock === 'bpm';
  const isDecoupled = primaryClock === 'decoupled';
  const phraseSeconds = state.phraseLength ?? transportMetrics.phraseDurationFromBeatClockSec;
  const beatBpm = state.sequencerMasterBPM ?? transportMetrics.effectiveBpm;
  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const rootNoteLabel = NOTE_NAMES[state.rootNote] ?? 'C';
  const displayMorphPosition = formatMorphPercent(morphPosition);
  const displayMorphA = 100 - displayMorphPosition;
  const sceneHasRuntimeDualParams = React.useMemo(
    () => hasSceneRuntimeDualParams(sliderModes, dualSliderRanges),
    [dualSliderRanges, sliderModes],
  );
  const [sceneRuntimeSignature, setSceneRuntimeSignature] = React.useState('');
  const updateSceneRuntimeSignature = React.useCallback(() => {
    if (!sceneHasRuntimeDualParams) {
      setSceneRuntimeSignature((current) => current === '' ? current : '');
      return;
    }
    const nextSignature = createSceneRuntimeSignature(state, sliderModes, dualSliderRanges);
    setSceneRuntimeSignature((current) => current === nextSignature ? current : nextSignature);
  }, [dualSliderRanges, sceneHasRuntimeDualParams, sliderModes, state]);

  // Poll the external runtime store at UI-rate instead of subscribing the SVG to every engine tick.
  useVisibleInterval(updateSceneRuntimeSignature, SCENE_SIGNAL_RUNTIME_POLL_MS, {
    enabled: sceneHasRuntimeDualParams,
    immediate: true,
    pauseWhenHidden: true,
  });

  React.useEffect(() => {
    if (!sceneHasRuntimeDualParams) {
      setSceneRuntimeSignature((current) => current === '' ? current : '');
    }
  }, [sceneHasRuntimeDualParams]);

  const sceneRuntimeState = React.useMemo(
    () => resolveSceneRuntimeState(state, sliderModes, dualSliderRanges),
    [dualSliderRanges, sceneRuntimeSignature, sliderModes, state],
  );
  const sceneSignal = React.useMemo(() => buildSceneSignalModel(sceneRuntimeState), [sceneRuntimeState]);
  const [hoveredSceneNodeId, setHoveredSceneNodeId] = React.useState<string | null>(null);
  const [pinnedSceneNodeId, setPinnedSceneNodeId] = React.useState<string | null>(null);
  const [scenePopoverPoint, setScenePopoverPoint] = React.useState<{ x: number; y: number; placement: 'top' | 'bottom' } | null>(null);
  const activeSceneNodeId = pinnedSceneNodeId ?? hoveredSceneNodeId;
  const activeSceneNode = sceneSignal.nodes.find((node) => node.id === activeSceneNodeId) ?? null;
  const activeSceneConnections = React.useMemo(
    () => activeSceneNodeId
      ? sceneSignal.sends.filter((send) => send.from.id === activeSceneNodeId || send.to.id === activeSceneNodeId)
      : [],
    [activeSceneNodeId, sceneSignal.sends],
  );
  const activeSceneConnectionIds = React.useMemo(
    () => new Set(activeSceneConnections.map((send) => send.id)),
    [activeSceneConnections],
  );
  const activeSceneConnectedNodeIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (activeSceneNodeId) ids.add(activeSceneNodeId);
    for (const send of activeSceneConnections) {
      ids.add(send.from.id);
      ids.add(send.to.id);
    }
    return ids;
  }, [activeSceneConnections, activeSceneNodeId]);
  const activeSceneOutgoingSends = activeSceneConnections.filter((send) => send.from.id === activeSceneNodeId);
  const activeSceneIncomingSends = activeSceneConnections.filter((send) => send.to.id === activeSceneNodeId);
  const updateScenePopoverPoint = React.useCallback((element: Element) => {
    if (typeof window === 'undefined') return;
    const rect = element.getBoundingClientRect();
    const halfWidth = SCENE_SIGNAL_POPOVER_WIDTH / 2;
    const x = Math.min(
      window.innerWidth - SCENE_SIGNAL_POPOVER_MARGIN - halfWidth,
      Math.max(SCENE_SIGNAL_POPOVER_MARGIN + halfWidth, rect.left + rect.width / 2),
    );
    const placement = rect.top > 190 ? 'top' : 'bottom';
    const y = placement === 'top' ? rect.top : rect.bottom;
    setScenePopoverPoint({ x, y, placement });
  }, []);
  const showSceneNodeDetails = React.useCallback((nodeId: string, element: Element) => {
    setHoveredSceneNodeId(nodeId);
    updateScenePopoverPoint(element);
  }, [updateScenePopoverPoint]);
  const togglePinnedSceneNode = React.useCallback((nodeId: string, element: Element) => {
    updateScenePopoverPoint(element);
    setHoveredSceneNodeId(nodeId);
    setPinnedSceneNodeId((current) => current === nodeId ? null : nodeId);
  }, [updateScenePopoverPoint]);
  React.useEffect(() => {
    if (activeSceneNodeId && !sceneSignal.nodes.some((node) => node.id === activeSceneNodeId)) {
      setHoveredSceneNodeId(null);
      setPinnedSceneNodeId(null);
      setScenePopoverPoint(null);
    }
  }, [activeSceneNodeId, sceneSignal.nodes]);
  React.useEffect(() => {
    if (!pinnedSceneNodeId || typeof document === 'undefined') return;
    const closePinnedPopover = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('.scene-signal-node, [data-scene-signal-popover]')) return;
      setPinnedSceneNodeId(null);
      setHoveredSceneNodeId(null);
    };
    document.addEventListener('pointerdown', closePinnedPopover);
    return () => document.removeEventListener('pointerdown', closePinnedPopover);
  }, [pinnedSceneNodeId]);
  const sceneHarmony = engineState.harmonyState;
  const sceneKeyRootLabel = NOTE_NAMES[pitchClass(sceneHarmony?.effectiveRoot ?? state.rootNote)] ?? rootNoteLabel;
  const sceneScaleLabel = sceneHarmony?.scaleFamily.name ?? (state.scaleMode === 'manual' ? state.manualScale : 'Auto');
  const sceneChordRootPc = getSceneChordRootPc(sceneHarmony, state.rootNote);
  const sceneChordLabel = formatSceneChordName(sceneHarmony, state.rootNote);
  const sceneChordNotes = formatSceneChordNotes(sceneHarmony?.currentChord.midiNotes, sceneChordRootPc);
  const sceneDegreeLabel = DEGREE_LABELS[sceneHarmony?.currentDegree ?? state.chordProgressionPattern?.[0] ?? 0] ?? 'I';
  const sceneArc = sceneHarmony?.tensionArc;
  const sceneArcPhase = sceneArc && sceneArc.type !== 'sustain'
    ? sceneArc.type.charAt(0).toUpperCase() + sceneArc.type.slice(1)
    : null;
  const sceneArcLeft = sceneArc && sceneArc.phrasesRemaining > 0 ? `${sceneArc.phrasesRemaining} left` : null;
  const sceneHarmonyTimer = engineState.isRunning ? engineState.transportDebug?.nextHarmonyEventIn : null;
  const scenePhraseTimer = engineState.isRunning ? engineState.transportDebug?.nextPhraseBoundaryIn : null;
  const sceneTimerTokens = sceneHarmonyTimer !== null &&
    sceneHarmonyTimer !== undefined &&
    scenePhraseTimer !== null &&
    scenePhraseTimer !== undefined &&
    Math.abs(sceneHarmonyTimer - scenePhraseTimer) > 0.05
    ? [`${formatSceneSeconds(sceneHarmonyTimer, 'H')} ${formatSceneSeconds(scenePhraseTimer, 'P')}`]
    : [formatSceneSeconds(sceneHarmonyTimer ?? scenePhraseTimer ?? phraseSeconds)];
  const sceneHarmonyLine = [
    `${sceneKeyRootLabel} ${sceneScaleLabel}`,
    sceneChordLabel,
    sceneChordNotes,
    sceneDegreeLabel,
    sceneArcPhase,
    sceneArcLeft,
    ...sceneTimerTokens,
  ].filter(Boolean).join(' · ');

  return (
    <div className="global-root">
      <div className="global-container">
        <div className="global-summary-panel">
        {/* Presets Card */}
        <div className="presets-card">
          <h3 className="presets-card-title">Presets</h3>

          {/* Preset Morph Section */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('morph')}>
              <span className={`harmony-section-chevron ${expandedSections.has('morph') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Preset Morph</span>
            </div>
            {expandedSections.has('morph') && (
              <div className="harmony-section-body">
                {/* Slot A */}
                <div className="morph-slot">
                  <div className="morph-slot-header">
                    <span className="morph-slot-label slot-a">Slot A</span>
                    {morphPresetA && (
                      <button onClick={onClearMorphA} className="morph-clear-btn">✕</button>
                    )}
                  </div>
                  <PresetDropdown
                    level="state"
                    scope="global"
                    state={state}
                    currentName={morphSlotAName}
                    onLoad={onLoadMorphA}
                    showSaveButton={false}
                    compact
                  />
                </div>

                {/* Morph Position */}
                <div className="morph-position">
                  <div className="morph-position-header">
                    <span className="morph-position-label">Morph Position</span>
                    <span className="morph-position-value">{displayMorphPosition}%</span>
                  </div>
                  <div className="morph-position-track">
                    <span className="morph-endpoint a">A</span>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={morphPosition}
                      onChange={(e) => onMorphPositionChange(parseInt(e.target.value))}
                      disabled={!morphPresetA && !morphPresetB}
                    />
                    <span className="morph-endpoint b">B</span>
                  </div>
                  <div className="morph-position-hint">
                    {isAtEndpoint0(morphPosition, true) ? 'Full A' :
                     isAtEndpoint1(morphPosition, true) ? 'Full B' :
                     `${displayMorphA}% A + ${displayMorphPosition}% B`}
                  </div>
                </div>

                {/* Slot B */}
                <div className="morph-slot">
                  <div className="morph-slot-header">
                    <span className="morph-slot-label slot-b">Slot B</span>
                    {morphPresetB && (
                      <button onClick={onClearMorphB} className="morph-clear-btn">✕</button>
                    )}
                  </div>
                  <PresetDropdown
                    level="state"
                    scope="global"
                    state={state}
                    currentName={morphSlotBName}
                    onLoad={onLoadMorphB}
                    showSaveButton={false}
                    compact
                  />
                </div>

                {/* Mode Toggle */}
                <div className="morph-divider">
                  <div className="morph-mode-row">
                    <span className="morph-mode-label">Mode:</span>
                    <button
                      onClick={() => onMorphModeChange('manual')}
                      className={`morph-mode-btn ${morphMode === 'manual' ? 'active' : ''}`}
                    >Manual</button>
                    <button
                      onClick={() => onMorphModeChange('auto')}
                      className={`morph-mode-btn ${morphMode === 'auto' ? 'active' : ''}`}
                    >Auto-Cycle</button>
                  </div>

                  {/* Auto-Cycle Settings */}
                  {morphMode === 'auto' && (
                    <div className="morph-auto-box">
                      <div className="morph-auto-slider">
                        <div className="morph-auto-slider-header">
                          <span className="morph-auto-slider-label">Play Phrases</span>
                          <span className="morph-auto-slider-val">{morphPlayPhrases}</span>
                        </div>
                        <input
                          type="range" min="4" max="64" step="4"
                          value={morphPlayPhrases}
                          onChange={(e) => onMorphPlayPhrasesChange(parseInt(e.target.value))}
                        />
                      </div>
                      <div className="morph-auto-slider">
                        <div className="morph-auto-slider-header">
                          <span className="morph-auto-slider-label">Morph Phrases</span>
                          <span className="morph-auto-slider-val">{morphTransitionPhrases}</span>
                        </div>
                        <input
                          type="range" min="2" max="32" step="2"
                          value={morphTransitionPhrases}
                          onChange={(e) => onMorphTransitionPhrasesChange(parseInt(e.target.value))}
                        />
                      </div>
                      <div className="morph-cycle-text">
                        Cycle: {morphPlayPhrases}→morph({morphTransitionPhrases})→{morphPlayPhrases}→morph({morphTransitionPhrases})
                      </div>
                      {morphCountdown && engineState.isRunning && (
                        <div className="morph-countdown">
                          <div className="morph-countdown-phase">{morphCountdown.phase}</div>
                          <div className="morph-countdown-value">
                            {morphCountdown.phrasesLeft} phrase{morphCountdown.phrasesLeft !== 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* State Preset Save/Load */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('state-presets')}>
              <span className={`harmony-section-chevron ${expandedSections.has('state-presets') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">State Presets</span>
            </div>
            {expandedSections.has('state-presets') && (
              <div className="harmony-section-body">
                <PresetFamilyTree
                  level="state"
                  scope="global"
                  state={state}
                  currentName={statePresetName}
                  onLoadSlotA={onLoadMorphA}
                  onLoadSlotB={onLoadMorphB}
                  sliderModes={sliderModes}
                  dualSliderRanges={dualSliderRanges}
                  getSaveMetadata={getStatePresetSaveMetadata}
                  customExtract={extractOptimizedStatePresetData}
                />
              </div>
            )}
          </div>
        </div>

        <div className="scene-card scene-card-ultra">
          <div className="scene-ultra-top">
            <div className="scene-card-header scene-ultra-header">
              <h3 className="scene-card-title">Snapshot</h3>
            </div>

            <div className="scene-harmony-line" title={sceneHarmonyLine}>
              <span>{sceneHarmonyLine}</span>
            </div>
          </div>

          <div className="scene-signal-graph" aria-label="Active sound engines and FX sends">
            <svg className="scene-signal-map" viewBox={`0 0 ${SCENE_SIGNAL_VIEWBOX_WIDTH} ${SCENE_SIGNAL_VIEWBOX_HEIGHT}`} role="img" aria-labelledby="global-scene-signal-title">
              <title id="global-scene-signal-title">Active sound engines and FX sends</title>
              <g className="scene-send-layer">
                {sceneSignal.sends.filter((send) => !send.hidden).map((send) => (
                  <path
                    key={send.id}
                    className={`scene-send-line${send.lane === 'master' ? ' master' : ''}${activeSceneNodeId ? (activeSceneConnectionIds.has(send.id) ? ' selected' : ' muted') : ''}`}
                    style={sendStyle(send)}
                    d={sceneSendPath(send.from, send.to)}
                  />
                ))}
              </g>
              <g className="scene-node-layer">
                {sceneSignal.nodes.map((node) => {
                  const isSelected = activeSceneNodeId === node.id;
                  const isConnected = activeSceneConnectedNodeIds.has(node.id);
                  return (
                    <g
                      key={node.id}
                      className={`scene-signal-node ${node.role}${isSelected ? ' selected' : ''}${activeSceneNodeId && !isConnected ? ' muted' : ''}`}
                      transform={`translate(${node.x} ${node.y})`}
                      style={nodeStyle(node)}
                      tabIndex={0}
                      role="button"
                      aria-haspopup="dialog"
                      aria-expanded={isSelected}
                      aria-label={`${node.label} ${scenePercent(node.level)} percent`}
                      onPointerEnter={(event) => {
                        if (!pinnedSceneNodeId || pinnedSceneNodeId === node.id) showSceneNodeDetails(node.id, event.currentTarget);
                      }}
                      onPointerLeave={() => {
                        if (!pinnedSceneNodeId) {
                          setHoveredSceneNodeId(null);
                          setScenePopoverPoint(null);
                        }
                      }}
                      onFocus={(event) => {
                        if (!pinnedSceneNodeId || pinnedSceneNodeId === node.id) showSceneNodeDetails(node.id, event.currentTarget);
                      }}
                      onBlur={() => {
                        if (!pinnedSceneNodeId) {
                          setHoveredSceneNodeId(null);
                          setScenePopoverPoint(null);
                        }
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        togglePinnedSceneNode(node.id, event.currentTarget);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          togglePinnedSceneNode(node.id, event.currentTarget);
                        } else if (event.key === 'Escape') {
                          setPinnedSceneNodeId(null);
                          setHoveredSceneNodeId(null);
                          setScenePopoverPoint(null);
                        }
                      }}
                    >
                      <rect className="scene-signal-node-halo" x="-88" y="-32" width="168" height="64" rx="32" />
                      <rect className="scene-signal-node-shell" x="-82" y="-28" width="160" height="56" rx="28" />
                      <rect className="scene-signal-node-core" x="-70" y="-22" width="136" height="44" rx="22" />
                      <text className="scene-signal-node-icon" x="-51" y="3">{SCENE_SIGNAL_SYMBOLS[node.kind]}</text>
                      <text className="scene-signal-node-name" x="-30" y="-5">{node.label}</text>
                      <text className="scene-signal-node-value" x="-30" y="15">{scenePercent(node.level)}</text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {activeSceneNode && scenePopoverPoint && (
              <div
                className="scene-signal-popover"
                data-scene-signal-popover="true"
                style={{
                  ...sceneSignalPopoverStyle(scenePopoverPoint),
                  '--rgb': activeSceneNode.rgb,
                } as React.CSSProperties}
                role="dialog"
                aria-label={`${activeSceneNode.label} sends`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="scene-signal-popover-title">
                  <span className="scene-signal-popover-dot" aria-hidden="true" />
                  <span>{activeSceneNode.label}</span>
                  <strong>{scenePercent(activeSceneNode.level)}%</strong>
                </div>
                <div className="scene-signal-popover-section">
                  <div className="scene-signal-popover-kicker">Output</div>
                  <div className="scene-signal-popover-row">
                    <span>Level</span>
                    <span>{scenePercent(activeSceneNode.level)}%</span>
                    <span className="scene-signal-popover-meter" aria-hidden="true">
                      <span style={{ width: `${clamp01(activeSceneNode.level) * 100}%` }} />
                    </span>
                  </div>
                </div>

                {activeSceneOutgoingSends.length > 0 && (
                  <div className="scene-signal-popover-section">
                    <div className="scene-signal-popover-kicker">Sends</div>
                    {activeSceneOutgoingSends.map((send) => (
                      <div className="scene-signal-popover-row" key={send.id}>
                        <span>{sceneSendLabel(send, activeSceneNode.id)}</span>
                        <span>{scenePercent(send.amount)}%</span>
                        <span className="scene-signal-popover-meter" aria-hidden="true">
                          <span style={{ width: `${clamp01(send.amount) * 100}%` }} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {activeSceneIncomingSends.length > 0 && (
                  <div className="scene-signal-popover-section">
                    <div className="scene-signal-popover-kicker">Receives</div>
                    {activeSceneIncomingSends.map((send) => (
                      <div className="scene-signal-popover-row" key={send.id}>
                        <span>{sceneSendLabel(send, activeSceneNode.id)}</span>
                        <span>{scenePercent(send.amount)}%</span>
                        <span className="scene-signal-popover-meter" aria-hidden="true">
                          <span style={{ width: `${clamp01(send.amount) * 100}%` }} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {activeSceneConnections.length === 0 && (
                  <div className="scene-signal-popover-empty">No active sends</div>
                )}
              </div>
            )}
          </div>

          <div className="scene-master-control">
            <Slider label="Master Output" value={state.masterVolume} paramKey="masterVolume" onChange={onParamChange} {...sliderProps('masterVolume')} />
          </div>
        </div>

        {runtimeComparison && <GlobalRuntimeComparisonPanel {...runtimeComparison} />}
      </div>

      {/* Harmony Engine */}
      <div className="global-engine-panel">
        <div className="harmony-card">
          <h3 className="harmony-card-title">Harmony Engine</h3>

          {/* Root & CoF + Chord Progression side by side */}
          <div className="harmony-row-2col">
            {/* Root & CoF Drift */}
            <div className="harmony-section">
              <div className="harmony-section-header" onClick={() => toggleSection('root-cof')}>
                <span className={`harmony-section-chevron ${expandedSections.has('root-cof') ? 'expanded' : ''}`}>▶</span>
                <span className="harmony-section-name">Root & CoF Drift</span>
              </div>
              {expandedSections.has('root-cof') && (
                <div className="harmony-section-body">
                  <Select
                    label="Root Note"
                    value={String(state.rootNote)}
                    options={[
                      { value: '0', label: 'C' },
                      { value: '1', label: 'C#' },
                      { value: '2', label: 'D' },
                      { value: '3', label: 'D#' },
                      { value: '4', label: 'E' },
                      { value: '5', label: 'F' },
                      { value: '6', label: 'F#' },
                      { value: '7', label: 'G' },
                      { value: '8', label: 'G#' },
                      { value: '9', label: 'A' },
                      { value: '10', label: 'A#' },
                      { value: '11', label: 'B' },
                    ]}
                    onChange={(v: string) => onSelectChange('rootNote', parseInt(v, 10))}
                  />
                  <div className="cof-drift-block">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: state.cofDriftEnabled ? '#4ade80' : '#666' }}>
                        CoF Drift
                      </span>
                      <button
                        onClick={() => onSelectChange('cofDriftEnabled', !state.cofDriftEnabled)}
                        style={{
                          padding: '3px 10px',
                          fontSize: '0.7rem',
                          fontWeight: 'bold',
                          background: state.cofDriftEnabled ? '#22c55e' : '#333',
                          border: 'none',
                          borderRadius: '4px',
                          color: state.cofDriftEnabled ? '#000' : '#888',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {state.cofDriftEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <CircleOfFifths
                      homeRoot={state.rootNote}
                      currentStep={morphCoFViz ? morphCoFViz.cofStep : engineState.cofCurrentStep}
                      driftRange={state.cofDriftRange}
                      driftDirection={state.cofDriftDirection}
                      enabled={state.cofDriftEnabled}
                      size={140}
                      isMorphing={!!morphCoFViz}
                      morphStartRoot={morphCoFViz?.startRoot}
                      morphTargetRoot={morphCoFViz?.targetRoot}
                      morphProgress={morphPosition}
                      onSelectRoot={(semitone: number) => {
                        onSelectChange('rootNote', semitone);
                        onResetCofDrift();
                      }}
                    />
                    {state.cofDriftEnabled && (
                      <>
                        <Slider label="Rate (phrases)" value={state.cofDriftRate} paramKey="cofDriftRate" onChange={onParamChange} />
                        <Select
                          label="Direction"
                          value={state.cofDriftDirection}
                          options={[
                            { value: 'cw', label: 'CW' },
                            { value: 'ccw', label: 'CCW' },
                            { value: 'random', label: 'Rnd' },
                          ]}
                          onChange={(v: string) => onSelectChange('cofDriftDirection', v)}
                        />
                        <Slider label="Range (steps)" value={state.cofDriftRange} paramKey="cofDriftRange" onChange={onParamChange} />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Chord Progression */}
            <div className="harmony-section">
              <div className="harmony-section-header" onClick={() => toggleSection('chord-progression')}>
                <span className={`harmony-section-chevron ${expandedSections.has('chord-progression') ? 'expanded' : ''}`}>▶</span>
                <span className="harmony-section-name">Chord Progression</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onSelectChange('chordProgressionEnabled', !state.chordProgressionEnabled); }}
                  style={{
                    marginLeft: 'auto',
                    padding: '3px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    background: state.chordProgressionEnabled ? '#22c55e' : '#333',
                    border: 'none',
                    borderRadius: '4px',
                    color: state.chordProgressionEnabled ? '#000' : '#888',
                    cursor: 'pointer',
                  }}
                >
                  {state.chordProgressionEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              {expandedSections.has('chord-progression') && state.chordProgressionEnabled && (
                <div className="harmony-section-body">
                  <div className="harmony-grid-2">
                    <Select
                      label="Clock Source"
                      value={state.chordProgressionClockSource}
                      options={[
                        { value: 'harmony', label: 'Follow Harmony' },
                        { value: 'globalPhrase', label: 'Global Phrase' },
                        { value: 'localPhrase', label: 'Local Phrase' },
                      ]}
                      onChange={(v: string) => onSelectChange('chordProgressionClockSource', v)}
                      {...bindHelp('chordProgressionClockSource')}
                    />
                    <Select
                      label="Step Length"
                      value={String(state.chordProgressionPhraseMultiplier)}
                      options={[
                        { value: '1', label: '1 Phrase' },
                        { value: '2', label: '2 Phrases' },
                        { value: '4', label: '4 Phrases' },
                        { value: '8', label: '8 Phrases' },
                      ]}
                      onChange={(v: string) => onSelectChange('chordProgressionPhraseMultiplier', parseInt(v, 10))}
                      {...bindHelp('chordProgressionPhraseMultiplier')}
                    />
                  </div>
                  <Slider
                    label="Pattern Length"
                    value={state.chordProgressionSteps}
                    paramKey="chordProgressionSteps"
                    onChange={onParamChange}
                    {...sliderProps('chordProgressionSteps')}
                  />
                  <Select
                    label="Preset"
                    value="custom"
                    options={[
                      { value: 'custom', label: 'Custom' },
                      { value: '0,3,4,0', label: 'I – IV – V – I' },
                      { value: '0,5,3,4', label: 'I – vi – IV – V' },
                      { value: '1,4,0,0', label: 'ii – V – I – I' },
                      { value: '0,2,5,3', label: 'I – iii – vi – IV' },
                      { value: '0,4,5,3', label: 'I – V – vi – IV' },
                      { value: '0,3,1,4', label: 'I – IV – ii – V' },
                      { value: '0,5,3,4,0,3,4,0', label: 'I – vi – IV – V – I – IV – V – I' },
                      { value: '0,6,5,6', label: 'i – VII – VI – VII' },
                      { value: '0,6,3,0', label: 'I – bVII – IV – I' },
                    ]}
                    onChange={(v: string) => {
                      if (v !== 'custom') {
                        const degrees = v.split(',').map(Number);
                        onSelectChange('chordProgressionPattern', degrees);
                        onSelectChange('chordProgressionSteps', degrees.length);
                        onSelectChange('chordProgressionStepEnabled', new Array(degrees.length).fill(true));
                      }
                    }}
                  />
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '5px' }}>Progression Steps</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(62px, 1fr))', gap: '6px' }}>
                      {Array.from({ length: progressionSteps }, (_, i) => {
                        const deg = (state.chordProgressionPattern ?? [])[i] ?? 0;
                        const isActive = progressionStepEnabled[i] ?? true;
                        return (
                          <div
                            key={i}
                            style={{
                              border: `1px solid ${isActive ? '#7c3aed' : '#333'}`,
                              background: isActive ? 'rgba(124, 58, 237, 0.14)' : '#171717',
                              borderRadius: '8px',
                              padding: '6px 5px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '5px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.6rem', color: '#888' }}>{`S${i + 1}`}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextEnabled = progressionStepEnabled.slice();
                                  nextEnabled[i] = !isActive;
                                  onSelectChange('chordProgressionStepEnabled', nextEnabled);
                                }}
                                style={{
                                  fontSize: '0.56rem',
                                  fontWeight: 700,
                                  color: isActive ? '#ede9fe' : '#777',
                                  background: isActive ? 'rgba(167, 139, 250, 0.18)' : '#222',
                                  border: '1px solid #3a3a3a',
                                  borderRadius: '999px',
                                  padding: '2px 5px',
                                  cursor: 'pointer',
                                }}
                                {...bindHelp('chordProgressionStepEnabled', { label: 'Step On/Off' })}
                              >
                                {isActive ? 'on' : 'off'}
                              </button>
                            </div>
                            <select
                              value={deg}
                              onChange={(e) => {
                                const newPattern = [...(state.chordProgressionPattern ?? [0, 3, 4, 0])];
                                while (newPattern.length < progressionSteps) newPattern.push(0);
                                newPattern[i] = parseInt(e.target.value, 10);
                                onSelectChange('chordProgressionPattern', newPattern);
                              }}
                              style={{
                                background: '#222',
                                color: '#ddd',
                                border: '1px solid #3a3a3a',
                                borderRadius: '6px',
                                padding: '4px 3px',
                                fontSize: '0.65rem',
                                cursor: 'pointer',
                              }}
                            >
                              {DEGREE_LABELS.map((label, d) => (
                                <option key={d} value={d}>{label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scale & Tension */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('scale-tension')}>
              <span className={`harmony-section-chevron ${expandedSections.has('scale-tension') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Scale & Tension</span>
            </div>
            {expandedSections.has('scale-tension') && (
              <div className="harmony-section-body">
                <div className="harmony-grid-2">
                  <Select
                    label="Scale Mode"
                    value={state.scaleMode}
                    options={[
                      { value: 'auto', label: 'Auto (tension-based)' },
                      { value: 'manual', label: 'Manual' },
                    ]}
                    onChange={(v: string) => onSelectChange('scaleMode', v)}
                  />
                  <Select
                    label="Seed Window"
                    value={state.seedWindow}
                    options={[
                      { value: 'hour', label: 'Hour (changes hourly)' },
                      { value: 'day', label: 'Day (changes daily)' },
                    ]}
                    onChange={(v: string) => onSelectChange('seedWindow', v)}
                  />
                </div>
                {state.scaleMode === 'manual' && (
                  <Select
                    label="Scale Family"
                    value={state.manualScale}
                    options={SCALE_FAMILIES.map((s) => ({ value: s.name, label: `${NOTE_NAMES[state.rootNote]} ${s.name}` }))}
                    onChange={(v: string) => onSelectChange('manualScale', v)}
                  />
                )}
                <div className="harmony-grid-2">
                  <Slider label="Tension" value={state.tension} paramKey="tension" onChange={onParamChange} {...sliderProps('tension')} />
                  <Slider label="Randomness" value={state.randomness} paramKey="randomness" onChange={onParamChange} {...sliderProps('randomness')} />
                </div>
                <div className="harmony-grid-2">
                  <Slider label="Walk Speed" value={state.randomWalkSpeed} paramKey="randomWalkSpeed" logarithmic onChange={onParamChange} {...sliderProps('randomWalkSpeed')} />
                  <Select
                    label="Walk Mode"
                    value={state.randomWalkMode}
                    options={[
                      { value: 'localBrownian', label: 'Local Brownian' },
                      { value: 'globalWalk', label: 'Global Epoch Walk' },
                    ]}
                    onChange={(v: string) => onSelectChange('randomWalkMode', v)}
                    {...bindHelp('randomWalkMode')}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('transport-sync')}>
              <span className={`harmony-section-chevron ${expandedSections.has('transport-sync') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Transport & Sync</span>
            </div>
            {expandedSections.has('transport-sync') && (
              <div className="harmony-section-body">
                <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '8px', lineHeight: 1.4 }}>
                  {isSecondsMaster
                    ? `${phraseSeconds.toFixed(1)}s phrase is the master clock and derives ≈ ${transportMetrics.equivalentBpmFromPhraseClock.toFixed(1)} BPM`
                    : isBpmMaster
                      ? `${beatBpm.toFixed(1)} BPM is the master clock and derives ${transportMetrics.phraseDurationFromBeatClockSec.toFixed(2)}s phrases`
                      : `${phraseSeconds.toFixed(1)}s phrase seconds and ${beatBpm.toFixed(1)} BPM are independent; phrase clocks read seconds while beat clocks read the shared BPM grid`}
                  <br />
                  {`${state.transportBarsPerPhrase} bars of ${state.transportBeatsPerBar}/4 per phrase`}
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Primary Clock"
                    value={primaryClock}
                    options={[
                      { value: 'seconds', label: 'Phrase Seconds Master' },
                      { value: 'bpm', label: 'Shared BPM Master' },
                      { value: 'decoupled', label: 'Decoupled' },
                    ]}
                    onChange={(v: string) => onSelectChange('transportPrimaryClock', v)}
                    {...bindHelp('transportPrimaryClock')}
                  />
                  {isSecondsMaster ? (
                    <Slider
                      label="Phrase Seconds"
                      value={phraseSeconds}
                      paramKey="phraseLength"
                      onChange={onParamChange}
                      {...sliderProps('phraseLength')}
                    />
                  ) : isBpmMaster ? (
                    <Slider
                      label="Shared BPM"
                      value={beatBpm}
                      paramKey="sequencerMasterBPM"
                      onChange={onParamChange}
                      {...sliderProps('sequencerMasterBPM')}
                    />
                  ) : (
                    <div style={{ padding: '10px 12px', border: '1px solid #262626', borderRadius: '10px', background: '#21201e' }}>
                      <div style={{ fontSize: '0.62rem', color: '#7f7f7f', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                        Decoupled Transport
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#d4d4d8', lineHeight: 1.45 }}>
                        Phrase-based clocks use Phrase Seconds. Beat-based clocks and sequencers use Shared BPM.
                      </div>
                    </div>
                  )}
                </div>
                {isDecoupled && (
                  <div className="harmony-grid-2">
                    <Slider
                      label="Phrase Seconds"
                      value={phraseSeconds}
                      paramKey="phraseLength"
                      onChange={onParamChange}
                      {...sliderProps('phraseLength')}
                    />
                    <Slider
                      label="Shared BPM"
                      value={beatBpm}
                      paramKey="sequencerMasterBPM"
                      onChange={onParamChange}
                      {...sliderProps('sequencerMasterBPM')}
                    />
                  </div>
                )}
                <div className="harmony-grid-2">
                  <div style={{ padding: '10px 12px', border: '1px solid #262626', borderRadius: '10px', background: '#21201e' }}>
                    <div style={{ fontSize: '0.62rem', color: '#7f7f7f', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                      Beat Phrase from BPM
                    </div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isBpmMaster ? '#f5f5f5' : '#9ca3af' }}>
                      {transportMetrics.phraseDurationFromBeatClockSec.toFixed(2)}s
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', border: '1px solid #262626', borderRadius: '10px', background: '#21201e' }}>
                    <div style={{ fontSize: '0.62rem', color: '#7f7f7f', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                      Equivalent BPM from Phrase
                    </div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isSecondsMaster ? '#f5f5f5' : '#9ca3af' }}>
                      {transportMetrics.equivalentBpmFromPhraseClock.toFixed(1)}
                    </div>
                  </div>
                </div>
                <div className="harmony-grid-2">
                  <Slider
                    label="Bars / Phrase"
                    value={state.transportBarsPerPhrase}
                    paramKey="transportBarsPerPhrase"
                    onChange={onParamChange}
                    {...sliderProps('transportBarsPerPhrase')}
                  />
                  <Slider
                    label="Beats / Bar"
                    value={state.transportBeatsPerBar}
                    paramKey="transportBeatsPerBar"
                    onChange={onParamChange}
                    {...sliderProps('transportBeatsPerBar')}
                  />
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Harmony / Pad Clock"
                    value={state.harmonyClockSource}
                    options={[
                      { value: 'globalPhrase', label: 'Global Phrase' },
                      { value: 'localPhrase', label: 'Local Phrase' },
                      { value: 'globalBeat', label: 'Global Beat Phrase' },
                      { value: 'localBeat', label: 'Local Beat Phrase' },
                    ]}
                    onChange={(v: string) => onSelectChange('harmonyClockSource', v)}
                    {...bindHelp('harmonyClockSource')}
                  />
                  <Select
                    label="Harmony / Pad Apply"
                    value={state.harmonySyncPolicy}
                    options={[
                      { value: 'nextPhrase', label: 'Next Phrase' },
                      { value: 'free', label: 'Immediate' },
                      { value: 'restartNow', label: 'Restart Now' },
                    ]}
                    onChange={(v: string) => onSelectChange('harmonySyncPolicy', v)}
                    {...bindHelp('harmonySyncPolicy')}
                  />
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Lead Random Clock"
                    value={state.leadRandomClockSource}
                    options={[
                      { value: 'globalPhrase', label: 'Global Phrase' },
                      { value: 'localPhrase', label: 'Local Phrase' },
                      { value: 'globalBeat', label: 'Global Beat Phrase' },
                      { value: 'localBeat', label: 'Local Beat Phrase' },
                    ]}
                    onChange={(v: string) => onSelectChange('leadRandomClockSource', v)}
                    {...bindHelp('leadRandomClockSource')}
                  />
                  <Select
                    label="Lead Random Apply"
                    value={state.leadRandomSyncPolicy}
                    options={[
                      { value: 'nextPhrase', label: 'Next Phrase' },
                      { value: 'free', label: 'Immediate' },
                    ]}
                    onChange={(v: string) => onSelectChange('leadRandomSyncPolicy', v)}
                    {...bindHelp('leadRandomSyncPolicy')}
                  />
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Synth Euclid Clock"
                    value={state.synthEuclidClockSource}
                    options={[
                      { value: 'localBeat', label: 'Local Beat' },
                      { value: 'globalBeat', label: 'Global Beat' },
                    ]}
                    onChange={(v: string) => onSelectChange('synthEuclidClockSource', v)}
                    {...bindHelp('synthEuclidClockSource')}
                  />
                  <Select
                    label="Synth Euclid Join"
                    value={state.synthEuclidJoinPolicy}
                    options={[
                      { value: 'bar', label: 'Next Bar' },
                      { value: 'grid', label: 'Grid' },
                    ]}
                    onChange={(v: string) => onSelectChange('synthEuclidJoinPolicy', v)}
                    {...bindHelp('synthEuclidJoinPolicy')}
                  />
                </div>
                <div className="harmony-grid-2">
                  <Select
                    label="Drum Euclid Clock"
                    value={state.drumEuclidClockSource}
                    options={[
                      { value: 'localBeat', label: 'Local Beat' },
                      { value: 'globalBeat', label: 'Global Beat' },
                    ]}
                    onChange={(v: string) => onSelectChange('drumEuclidClockSource', v)}
                    {...bindHelp('drumEuclidClockSource')}
                  />
                  <Select
                    label="Drum Euclid Join"
                    value={state.drumEuclidJoinPolicy}
                    options={[
                      { value: 'bar', label: 'Next Bar' },
                      { value: 'grid', label: 'Grid' },
                    ]}
                    onChange={(v: string) => onSelectChange('drumEuclidJoinPolicy', v)}
                    {...bindHelp('drumEuclidJoinPolicy')}
                  />
                </div>
                <div style={{ marginTop: '8px', padding: '8px 10px', background: '#161616', border: '1px solid #262626', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#c084fc', fontWeight: 700, marginBottom: '6px' }}>Next Events</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 12px', fontSize: '0.68rem' }}>
                    <div><span style={{ color: '#777' }}>Harmony:</span> <span style={{ color: '#ddd' }}>{engineState.transportDebug?.nextHarmonyEventIn !== null && engineState.transportDebug?.nextHarmonyEventIn !== undefined ? `${engineState.transportDebug.nextHarmonyEventIn.toFixed(2)}s` : '—'}</span></div>
                    <div><span style={{ color: '#777' }}>Phrase:</span> <span style={{ color: '#ddd' }}>{engineState.transportDebug ? `${engineState.transportDebug.nextPhraseBoundaryIn.toFixed(2)}s` : '—'}</span></div>
                    <div><span style={{ color: '#777' }}>Progression:</span> <span style={{ color: '#ddd' }}>{engineState.transportDebug?.nextProgressionStepIn !== null && engineState.transportDebug?.nextProgressionStepIn !== undefined ? `${engineState.transportDebug.nextProgressionStepIn.toFixed(2)}s` : '—'}</span></div>
                    <div><span style={{ color: '#777' }}>Beat BPM:</span> <span style={{ color: '#ddd' }}>{transportMetrics.effectiveBpm.toFixed(1)}</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Per-Engine Tension */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('per-engine-tension')}>
              <span className={`harmony-section-chevron ${expandedSections.has('per-engine-tension') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Per-Engine Tension</span>
            </div>
            {expandedSections.has('per-engine-tension') && (
              <div className="harmony-section-body">
                <div className="tension-engine-grid">
                  {([
                    ['pad', 'Pad', 'padTensionMode', 'padTensionValue'],
                    ['lead', 'Lead', 'leadTensionMode', 'leadTensionValue'],
                    ['synthEuclid', 'Synth', 'synthEuclidTensionMode', 'synthEuclidTensionValue'],
                    ['granular', 'Gran', 'granularTensionMode', 'granularTensionValue'],
                    ['reverb', 'Reverb', 'reverbTensionMode', 'reverbTensionValue'],
                    ['drum', 'Drum', 'drumTensionMode', 'drumTensionValue'],
                  ] as const).map(([_key, label, modeKey, valueKey]) => {
                    const mode = state[modeKey] ?? 'follow';
                    const value = state[valueKey] ?? 0;
                    const isBypassed = mode === 'bypass';
                    const effectiveT = isBypassed ? null
                      : mode === 'locked' ? Math.max(0, Math.min(1, value))
                      : Math.max(0, Math.min(1, (state.tension ?? 0.3) + value));
                    return (
                      <div key={modeKey} className="tension-engine-cell" style={isBypassed ? { opacity: 0.4 } : undefined}>
                        <div className="tension-engine-header">
                          <button
                            className={`tension-lock-btn ${mode === 'locked' ? 'locked' : ''}`}
                            onClick={() => {
                              const newMode = mode === 'follow' ? 'locked'
                                : mode === 'locked' ? 'bypass' : 'follow';
                              onSelectChange(modeKey, newMode);
                              if (newMode === 'locked') {
                                const effective = Math.max(0, Math.min(1, (state.tension ?? 0.3) + value));
                                onParamChange(valueKey, effective);
                              } else if (newMode === 'follow') {
                                onParamChange(valueKey, 0);
                              }
                            }}
                            title={mode === 'follow' ? 'Following (click to lock)' : mode === 'locked' ? 'Locked (click to bypass)' : 'Bypassed (click to follow)'}
                          >
                            {mode === 'locked' ? '▪' : mode === 'bypass' ? '⊘' : '▫'}
                          </button>
                          <span className="tension-engine-name">{label}</span>
                          {effectiveT !== null && (
                            <span className="tension-effective-value">{effectiveT.toFixed(2)}</span>
                          )}
                        </div>
                        {!isBypassed && (
                          <Slider
                            label=""
                            value={value}
                            paramKey={valueKey}
                            onChange={onParamChange}
                            {...(mode === 'locked'
                              ? { min: 0, max: 1, step: 0.01 }
                              : { min: -0.5, max: 0.5, step: 0.01 })}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Tension Arc */}
          {engineState.isRunning && engineState.harmonyState?.tensionArc && (
            <div className="harmony-section">
              <div className="harmony-section-body">
                <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '4px' }}>Tension Arc</div>
                {(() => {
                  const arc = engineState.harmonyState!.tensionArc;
                  const colorMap: Record<TensionArcType, string> = {
                    sustain: '#4ade80',
                    building: '#facc15',
                    resolving: '#60a5fa',
                  };
                  const labelMap: Record<TensionArcType, string> = {
                    sustain: 'Sustain',
                    building: 'Building',
                    resolving: 'Resolving',
                  };
                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 10px',
                      background: '#1a1a1a',
                      borderRadius: '6px',
                      border: `1px solid ${colorMap[arc.type]}33`,
                    }}>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: colorMap[arc.type],
                        boxShadow: `0 0 6px ${colorMap[arc.type]}88`,
                      }} />
                      <span style={{ fontSize: '0.75rem', color: colorMap[arc.type], fontWeight: 'bold' }}>
                        {labelMap[arc.type]}
                      </span>
                      {arc.phrasesRemaining > 0 && (
                        <span style={{ fontSize: '0.65rem', color: '#666' }}>
                          {arc.phrasesRemaining} phrase{arc.phrasesRemaining !== 1 ? 's' : ''} left
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Recording & Timer Card */}
        <div className="utility-card">
          <h3 className="utility-card-title">Recording & Timer</h3>

          {/* Recording Section */}
          {recordingAvailable && (
            <div className="harmony-section">
              <div className="harmony-section-header" onClick={() => toggleSection('recording')}>
                <span className={`harmony-section-chevron ${expandedSections.has('recording') ? 'expanded' : ''}`}>▶</span>
                <span className="harmony-section-name">Recording</span>
              </div>
              {expandedSections.has('recording') && (
                <div className="harmony-section-body">
                  <div className="utility-sub-label">Output Format</div>
                  <div className="utility-hint">Select one or both formats</div>
                  <div className="utility-btn-row">
                    <button
                      onClick={() => onRecordFormatsChange(prev => ({ ...prev, webm: !prev.webm }))}
                      disabled={isRecording}
                      className={`utility-toggle-btn ${recordFormats.webm ? 'active' : ''}`}
                    >
                      <span className="utility-toggle-dot">{recordFormats.webm ? '●' : '○'}</span> WebM
                      <span className="utility-toggle-hint">Opus · ~2 MB/min</span>
                    </button>
                    <button
                      onClick={() => onRecordFormatsChange(prev => ({ ...prev, wav: !prev.wav }))}
                      disabled={isRecording}
                      className={`utility-toggle-btn ${recordFormats.wav ? 'active' : ''}`}
                    >
                      <span className="utility-toggle-dot">{recordFormats.wav ? '●' : '○'}</span> WAV
                      <span className="utility-toggle-hint">24-bit 48kHz · ~17 MB/min</span>
                    </button>
                  </div>
                  {stemRecordingAvailable && (
                    <>
                      <div className="utility-sub-label" style={{ marginTop: '6px' }}>Stem Recording (Pre-Reverb)</div>
                      <div className="utility-stem-grid">
                        {STEM_RECORD_TRACK_IDS.map((key) => (
                          <button
                            key={key}
                            onClick={() => onRecordStemsChange(key)}
                            disabled={isRecording}
                            className={`utility-stem-btn ${recordStems[key] ? 'active' : ''}`}
                          >
                            {recordStems[key] ? '●' : '○'} {STEM_RECORD_TRACK_LABELS[key]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {isRecording && (
                    <div className="utility-status recording-status">
                      <div className="utility-status-value recording-pulse">● {formatRecordingTime(recordingDuration)}</div>
                      <div className="utility-status-hint">Recording in progress...</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Playback Timer Section */}
          <div className="harmony-section">
            <div className="harmony-section-header" onClick={() => toggleSection('playback-timer')}>
              <span className={`harmony-section-chevron ${expandedSections.has('playback-timer') ? 'expanded' : ''}`}>▶</span>
              <span className="harmony-section-name">Playback Timer</span>
              <button
                onClick={(e) => { e.stopPropagation(); onTimerEnabledChange(!playbackTimerEnabled); }}
                className={`utility-on-off-btn ${playbackTimerEnabled ? 'on' : ''}`}
              >
                {playbackTimerEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            {expandedSections.has('playback-timer') && (
              <div className="harmony-section-body">
                <div className="utility-sub-label">
                  Duration {engineState.isRunning && playbackTimerEnabled && <span style={{ color: '#f59e0b', fontSize: '0.6rem' }}>(click to reset)</span>}
                </div>
                <div className="utility-duration-row">
                  {[5, 15, 30, 60, 90, 120].map(mins => (
                    <button
                      key={mins}
                      onClick={() => {
                        onTimerMinutesChange(mins);
                        if (engineState.isRunning && playbackTimerEnabled) {
                          onTimerRemainingChange(mins * 60);
                        }
                      }}
                      className={`utility-dur-btn ${playbackTimerMinutes === mins ? 'active' : ''}`}
                    >
                      {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                    </button>
                  ))}
                  <div className="utility-custom-time">
                    <input
                      type="number"
                      min="1"
                      max="480"
                      value={![5, 15, 30, 60, 90, 120].includes(playbackTimerMinutes) ? playbackTimerMinutes : ''}
                      placeholder="Custom"
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= 480) {
                          onTimerMinutesChange(val);
                          if (engineState.isRunning && playbackTimerEnabled) {
                            onTimerRemainingChange(val * 60);
                          }
                        }
                      }}
                      className={`utility-custom-input ${![5, 15, 30, 60, 90, 120].includes(playbackTimerMinutes) ? 'active' : ''}`}
                    />
                    <span className="utility-custom-suffix">min</span>
                  </div>
                </div>
                {playbackTimerEnabled && playbackTimerRemaining !== null && (
                  <div className="utility-status timer-status">
                    <div className="utility-status-value">{Math.floor(playbackTimerRemaining / 60)}:{(playbackTimerRemaining % 60).toString().padStart(2, '0')}</div>
                    <div className="utility-status-hint">Remaining until auto-stop</div>
                  </div>
                )}
                {playbackTimerEnabled && playbackTimerRemaining === null && !engineState.isRunning && (
                  <div className="utility-status timer-status" style={{ opacity: 0.6 }}>
                    <div className="utility-status-hint">Timer will start when playback begins ({playbackTimerMinutes} min)</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default GlobalPage;
