import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import {
  KESSHO_PRODUCT_DRUM_PARAM_COUNT,
  KESSHO_PRODUCT_DRUM_PARAM_SPECS,
  KESSHO_PRODUCT_DRUM_VOICE_COUNT,
  KESSHO_PRODUCT_LEAD_PARAM_COUNT,
  KESSHO_PRODUCT_PAD_PARAM_COUNT,
  KESSHO_PRODUCT_PAD_PARAM_SPECS,
  KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT,
  KESSHO_PRODUCT_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT,
  KESSHO_PRODUCT_SOURCE_IDS as GENERATED_PRODUCT_SOURCE_IDS,
} from './generated/kesshoProductSchema';
import { delayNoteToSeconds } from './delayBuses';
import { computeGranularMacroModel, type GranularMacroModel } from './granularMacroCore';
import { ENGINE_TRIMS } from './outputTrims';
import { applyPadDistanceToState } from './distanceMacro';
import { sequencerClockDivisionToNumericValue } from './sequencerClockDivisions';
import { normalizeSequencerPitchBindingMode, sequencerPitchBindingModeToEventId, sequencerPitchBindingModeToProductId } from './sequencerPitchBinding';
import { normalizeSequencerPitchSettings } from './sequencerPitchSettings';
import { normalizeSequencerSwing } from './sequencerSwing';
import { DEFAULT_STATE, getIndexedDelayDivisionValue, type IndexedDelayDivisionKey, type SliderState } from '../ui/state';
import { generatedProductParamIndex } from './CoreProductGeneratedParamMetadata';
import {
  dynamicsDriftModeId,
  dynamicsDriftQualityId,
  dynamicsEndCompModeId,
  dynamicsErosionQualityId,
  dynamicsSaturationModeId,
  dynamicsSaturationQualityId,
  sidechainKeyId,
} from './CoreProductModeIds';
import { CORE_PRODUCT_SOUNDSCAPE_ASSETS } from './coreProductAssets';
import {
  SOUNDSCAPE_TEXTURE_PARAM_START,
  SOUNDSCAPE_TEXTURE_PARAM_STRIDE,
  SOUNDSCAPE_WATER_LAYER_PARAM_START,
  soundscapeSnapshotPayloadFromState,
} from './coreProductSoundscapesSnapshot';
import { migrateLegacyNatureSlotState } from './natureSlots';
import {
  HARMONY_QUALITY_IDS,
  HARMONY_ROOT_MODE_IDS,
  HARMONY_BASS_MODE_IDS,
  HARMONY_EXTENSION_IDS,
  HARMONY_ALTERATION_IDS,
  HARMONY_SLOT_COUNT,
  HARMONY_SEQUENCE_STEP_COUNT,
  HARMONY_STRENGTH_IDS,
  type HarmonyChordQuality,
  type HarmonyControlStrength,
} from './CoreProductHarmonyControl';
import type { RoutingMuteGroupsState } from '../ui/routing/routingMuteGroups';
import { resolveSequencerLaneAudibility } from './sequencerAudibility';
import type { HarmonyLiveLayer } from './harmony/harmonyProjection';
import type { ProductRuntimeModulationConfig } from './product/ProductEngineTypes';

export type CoreProductEvent = {
  sampleOffset?: number;
  eventKind: number;
  targetId?: number;
  index?: number;
  paramId?: number;
  value?: number;
  value2?: number;
  value3?: number;
  value4?: number;
  flags?: number;
};

/** Runtime-only audition flags shared with ProductConstants.h. */
export const CORE_PRODUCT_TRANSIENT_MANUAL_NOTE_AUDITION_FLAG = 0x20000000;
export const CORE_PRODUCT_TRANSIENT_MIDI_AUDITION_FLAG = 0x80000000;

/** Flags for the fixed-size HarmonyLiveChordGesture header/note records. */
export const CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS = Object.freeze({
  header: 1 << 0,
  note: 1 << 1,
  clear: 1 << 2,
  intent: 1 << 3,
  context: 1 << 4,
  takeover: 1 << 5,
} as const);

function harmonyLiveTarget(layer: HarmonyLiveLayer | null): number {
  const explicitTarget = typeof layer?.target === 'string' ? layer.target : null;
  if (explicitTarget === 'global') return 0;
  if (explicitTarget === 'detail') return 1;
  if (explicitTarget === 'overview') return 2;
  if (explicitTarget === 'seq1' || explicitTarget === 'seq2' || explicitTarget === 'seq3' || explicitTarget === 'seq4') return 3 + Number(explicitTarget.slice(3)) - 1;
  if (layer?.kind === 'seq-live') return 3 + Math.max(0, Math.min(3, layer.seqId ?? 0));
  if (layer?.kind === 'harmony-takeover') return 2;
  if (layer?.scope === 'overview' || (layer?.scope && typeof layer.scope === 'object' && (layer.scope as { kind?: unknown }).kind === 'overview')) return 2;
  if (layer?.scope === 'suggestion') return 0;
  return 1;
}

function harmonyLiveScope(layer: HarmonyLiveLayer | null): number {
  const explicitScope = typeof layer?.scope === 'string' ? layer.scope : null;
  if (explicitScope === 'detail') return 0;
  if (explicitScope === 'overview') return 1;
  if (explicitScope === 'suggestion') return 2;
  if (explicitScope === 'seq-draft') return 3;
  if (explicitScope === 'seq-live') return 4;
  if (layer?.kind === 'seq-live') return 4;
  if (layer?.kind === 'harmony-takeover') return 1;
  if (layer?.scope === 'overview' || (layer?.scope && typeof layer.scope === 'object' && (layer.scope as { kind?: unknown }).kind === 'overview')) return 1;
  if (layer?.scope === 'suggestion') return 2;
  if (layer?.scope === 'seq-draft') return 3;
  return 0;
}

/**
 * Build the bounded Product-Core gesture batch. The first event is a header;
 * it is followed by at most eight note records. No authored note list is
 * copied into a sequencer event, and the batch is safe to enqueue on the audio
 * thread's existing fixed-capacity control queue.
 */
export function createCoreProductHarmonyLiveChordGestureEvents(
  layer: HarmonyLiveLayer | null,
  revision: number,
): CoreProductEvent[] {
  const safeRevision = requireIntegerInRange(revision, 'revision', 0, Number.MAX_SAFE_INTEGER);
  const notes = (layer?.frame?.currentNotePool ?? [])
    .filter((note): note is number => Number.isFinite(note))
    .slice(0, 8)
    .map((note) => requireNumberInRange(note, 'note', 0, 127));
  const clearing = layer === null;
  const draft = layer?.draft;
  const intent = draft?.intent ?? null;
  const intentFlags = intent ? CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.intent : 0;
  const isTakeover = layer?.kind === 'harmony-takeover';
  const capturedRootMidi = draft?.capturedContext.rootMidi ?? layer?.frame?.rootMidi ?? 60;
  const capturedScaleId = draft?.capturedContext.scaleId ?? layer?.frame?.scaleId ?? 1;
  const playbackBehavior = draft?.playbackBehavior === 'relative' ? 1 : draft?.playbackBehavior === 'exact' ? 2 : 0;
  const takeoverProgress = isTakeover ? 1 : 0;
  const header: CoreProductEvent = {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyLiveChordGesture,
    targetId: harmonyLiveTarget(layer),
    index: harmonyLiveScope(layer),
    paramId: safeRevision,
    value: clearing ? 2 : layer?.latched ? 1 : 0,
    value2: playbackBehavior,
    value3: notes.length,
    value4: takeoverProgress,
    flags: CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.header | (clearing ? CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.clear : 0) | (isTakeover ? CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.takeover : 0),
  };
  if (clearing) return [header];
  const events: CoreProductEvent[] = [header];
  if (intent) {
    events.push(
      { eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyLiveChordGesture, targetId: harmonyLiveTarget(layer), index: 0, paramId: safeRevision, value: 1, value2: HARMONY_QUALITY_IDS[intent.quality] ?? 0, value3: HARMONY_ROOT_MODE_IDS[intent.rootMode] ?? 0, value4: intent.degree, flags: intentFlags },
      { eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyLiveChordGesture, targetId: harmonyLiveTarget(layer), index: 1, paramId: safeRevision, value: intent.rootNote, value2: intent.inversion, value3: intent.spread, value4: intent.octave, flags: intentFlags },
      { eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyLiveChordGesture, targetId: harmonyLiveTarget(layer), index: 2, paramId: safeRevision, value: HARMONY_BASS_MODE_IDS[intent.bassMode] ?? 0, value2: intent.bassNote ?? -1, value3: (intent.extensions ?? []).reduce((mask, extension) => mask | (1 << (HARMONY_EXTENSION_IDS[extension as keyof typeof HARMONY_EXTENSION_IDS] ?? 0)), 0), value4: (intent.alterations ?? []).reduce((mask, alteration) => mask | (1 << (HARMONY_ALTERATION_IDS[alteration] ?? 0)), 0), flags: intentFlags },
    );
  }
  if (draft || isTakeover) {
    events.push({ eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyLiveChordGesture, targetId: harmonyLiveTarget(layer), index: 0, paramId: safeRevision, value: capturedRootMidi, value2: capturedScaleId, flags: CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.context });
  }
  events.push(...notes.map((note, index) => ({
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyLiveChordGesture,
    targetId: harmonyLiveTarget(layer),
    index,
    value: note,
    value2: isTakeover ? (layer?.frame?.nextNotePool?.[index] ?? note) : note,
    value3: isTakeover ? 1 : 0,
    flags: CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.note,
  })));
  return events;
}

export const CORE_PRODUCT_SOURCE_IDS = Object.freeze({
  pad1: GENERATED_PRODUCT_SOURCE_IDS.Pad1,
  pad2: GENERATED_PRODUCT_SOURCE_IDS.Pad2,
  lead1: GENERATED_PRODUCT_SOURCE_IDS.Lead1,
  lead2: GENERATED_PRODUCT_SOURCE_IDS.Lead2,
  drum: GENERATED_PRODUCT_SOURCE_IDS.Drum,
  sample1: GENERATED_PRODUCT_SOURCE_IDS.Sample1,
  soundscape: GENERATED_PRODUCT_SOURCE_IDS.Soundscape,
  sample2: GENERATED_PRODUCT_SOURCE_IDS.Sample2,
} as const);

export const CORE_PRODUCT_CONTROL_ONLY_MODULATION_TARGET_ID = 0x7ffffff0;
export const CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE = 0x51000000;
export const CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE = 0x52000000;
export const CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE = 0x53000000;
export const CORE_PRODUCT_SOUNDSCAPE_TEXTURE_LEVEL_RANGE_TARGET_BASE = 0x54000000;
export const CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX = Object.freeze({
  sliceDuration: 0,
  density: 1,
  filterCutoff: 9,
  filterResonance: 10,
} as const);

export const CORE_PRODUCT_MODULATION_RANGE_MODE = Object.freeze({
  off: 0,
  sampleHold: 1,
  randomWalk: 2,
  shapeLfo: 3,
} as const);

export const CORE_PRODUCT_MODULATION_RANGE_FLAGS = Object.freeze({
  active: 1,
  shapeShift: 1,
  shapeMask: 0x6,
  timingShift: 3,
  timingMask: 0x18,
  syncReferencePhrase: 1 << 5,
  modulationSourceB: 1 << 6,
  triggerDelayA: 1 << 8,
  triggerDelayB: 1 << 9,
  triggerGranular: 1 << 10,
  triggerReverb: 1 << 11,
  randomWalkGlobal: 1 << 12,
  syncDivisionShift: 13,
  syncDivisionMask: 0xe000,
  randomWalkSpeedShift: 16,
  randomWalkSpeedScale: 1000,
} as const);

export const CORE_PRODUCT_SEQUENCER_IDS = Object.freeze({
  synth: 1,
  drum: 2,
} as const);

export const CORE_PRODUCT_TRANSPORT_FLAGS = Object.freeze({
  applyNextPhrase: 1 << 0,
} as const);

export function createCoreProductAutoStopEvent(durationSeconds: number | null): CoreProductEvent {
  const value = durationSeconds === null ? 0 : durationSeconds;
  if (!Number.isFinite(value) || value < 0 || value > 604800) {
    throw new RangeError(`Auto-stop duration must be between 0 and 604800 seconds; received ${value}`);
  }
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetAutoStop,
    value,
  };
}

const CORE_PRODUCT_SCATTER_PARAM_IDS = Object.freeze({
  enabled: 1,
  triggerProbability: 2,
  burstProbability: 3,
  randomWalk: 4,
  randomWalkEnabled: 5,
  feelX: 6,
  feelY: 7,
  anchor: 8,
  breath: 9,
  memory: 10,
  motion: 11,
  fracture: 12,
  spread: 13,
} as const);

type CoreProductScatterVoiceConfig = {
  enabled: boolean;
  triggerProbability: number;
  burstProbability: number;
  randomWalk?: number;
  randomWalkEnabled?: boolean;
  feelX: number;
  feelY: number;
  rules: {
    anchor: number;
    breath: number;
    memory: number;
    motion: number;
    fracture: number;
    spread: number;
  };
};

export function createCoreProductScatterConfigEvents(
  configs: readonly CoreProductScatterVoiceConfig[],
): CoreProductEvent[] {
  const events: CoreProductEvent[] = [];
  const push = (index: number, paramId: number, value: number) => {
    events.push({
      eventKind: KESSHO_PRODUCT_EVENT_IDS.SetScatterVoiceParam,
      index,
      paramId,
      value,
    });
  };
  configs.slice(0, 7).forEach((config, index) => {
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.enabled, config.enabled ? 1 : 0);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.triggerProbability, config.triggerProbability);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.burstProbability, config.burstProbability);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.randomWalk, config.randomWalk ?? 0);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.randomWalkEnabled, config.randomWalkEnabled ? 1 : 0);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.feelX, config.feelX);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.feelY, config.feelY);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.anchor, config.rules.anchor);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.breath, config.rules.breath);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.memory, config.rules.memory);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.motion, config.rules.motion);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.fracture, config.rules.fracture);
    push(index, CORE_PRODUCT_SCATTER_PARAM_IDS.spread, config.rules.spread);
  });
  events.push({ eventKind: KESSHO_PRODUCT_EVENT_IDS.CommitScatterConfig });
  return events;
}

export function createCoreProductScatterEnabledEvent(enabled: boolean): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetScatterEnabled,
    value: enabled ? 1 : 0,
  };
}

const CORE_PRODUCT_ROUTING_MUTE_ROW_BITS = Object.freeze({
  pad1: 1 << 0,
  pad2: 1 << 1,
  lead1: 1 << 2,
  lead2: 1 << 3,
  sample1: 1 << 4,
  sample2: 1 << 5,
  drums: 1 << 6,
  granular: 1 << 7,
  waves: 1 << 8,
  water: 1 << 9,
  insects: 1 << 10,
  nature: 1 << 11,
  delayAOut: 1 << 12,
  delayBOut: 1 << 13,
  degrade: 1 << 14,
  reverb: 1 << 15,
} as const);

/** SetRoutingMuteGroupSlot records with bit 31 carry one ordinary Product event. */
export const CORE_PRODUCT_ROUTING_MUTE_SCENE_COMMAND_FLAG = 0x80000000;
export const CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX = 0xffffffff;
export const CORE_PRODUCT_ROUTING_MUTE_MAX_SCENE_COMMANDS = 64;

const CORE_PRODUCT_SOUNDSCAPE_WATER_ACTIVE_MODULE_PARAM_INDEX = 0;
const CORE_PRODUCT_SOUNDSCAPE_INSECTS_ACTIVE_MODULE_PARAM_INDEX = 61;
const CORE_PRODUCT_SOUNDSCAPE_INSECTS2_ACTIVE_MODULE_PARAM_INDEX = 78;
const CORE_PRODUCT_SOUNDSCAPE_WATER_MASTER_MODULE_PARAM_INDEX = KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT + 5;
const CORE_PRODUCT_SOUNDSCAPE_INSECTS_MASTER_MODULE_PARAM_INDEX = KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT + 6;
const CORE_PRODUCT_SOUNDSCAPE_NATURE_MASTER_MODULE_PARAM_INDEX = KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT + 7;
const CORE_PRODUCT_SOUNDSCAPE_TEXTURE_ENABLED_PARAM_OFFSET = 6;
const ROUTING_MUTE_LEGACY_NATURE_ALIAS_PAIRS = [
  ['oceanSampleEnabled', 'nature1Enabled'],
  ['birdsEnabled', 'nature2Enabled'],
  ['birds2Enabled', 'nature3Enabled'],
  ['frogsEnabled', 'nature4Enabled'],
] as const;

function routingMuteBoolean(state: SliderState, key: keyof SliderState): number {
  return state[key] === true ? 1 : 0;
}

function routingMuteEffectiveReverbMix(state: SliderState): number {
  if (state.reverbEnabled !== true) return 0;
  const level = typeof state.reverbLevel === 'number' && Number.isFinite(state.reverbLevel)
    ? state.reverbLevel
    : DEFAULT_STATE.reverbLevel;
  return Math.max(0, Math.min(1, level));
}

function routingMuteDynamicsEnabled(state: SliderState): boolean {
  return state.dynamicsEnabled === true ||
    state.degradeEnabled === true ||
    state.driftEnabled === true ||
    state.erosionEnabled === true ||
    state.dynamicsSaturationEnabled === true;
}

function routingMuteSceneState(
  state: SliderState,
  statePatch: object | undefined,
): SliderState {
  if (!statePatch) return state;
  const rawPatch = statePatch as unknown as Record<string, unknown>;
  const migratedPatch = migrateLegacyNatureSlotState(rawPatch);
  const canonicalPatch: Record<string, unknown> = { ...rawPatch };
  for (const [legacyKey, canonicalKey] of ROUTING_MUTE_LEGACY_NATURE_ALIAS_PAIRS) {
    if (
      Object.prototype.hasOwnProperty.call(rawPatch, legacyKey) &&
      !Object.prototype.hasOwnProperty.call(rawPatch, canonicalKey)
    ) {
      canonicalPatch[canonicalKey] = migratedPatch[canonicalKey];
    }
  }
  return { ...state, ...canonicalPatch } as SliderState;
}

function routingMuteSceneCommands(state: SliderState): CoreProductEvent[] {
  const commands: CoreProductEvent[] = [
    createCoreProductSourceEnabledEvent(CORE_PRODUCT_SOURCE_IDS.pad1, state.padEnabled === true),
    createCoreProductSourceEnabledEvent(CORE_PRODUCT_SOURCE_IDS.pad2, state.pad2Enabled === true),
    createCoreProductSourceEnabledEvent(CORE_PRODUCT_SOURCE_IDS.lead1, state.leadEnabled === true),
    createCoreProductSourceEnabledEvent(CORE_PRODUCT_SOURCE_IDS.lead2, state.lead2Enabled === true),
    createCoreProductSourceEnabledEvent(CORE_PRODUCT_SOURCE_IDS.sample1, state.sample1Enabled === true),
    createCoreProductSourceEnabledEvent(CORE_PRODUCT_SOURCE_IDS.sample2, state.sample2Enabled === true),
    createCoreProductSourceEnabledEvent(CORE_PRODUCT_SOURCE_IDS.drum, state.drumEnabled === true),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxGranularEnabled, routingMuteBoolean(state, 'granularEnabled')),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxDelayAEnabled, routingMuteBoolean(state, 'delayAEnabled')),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxDelayBEnabled, routingMuteBoolean(state, 'granularDelayEnabled')),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEnabled, routingMuteDynamicsEnabled(state) ? 1 : 0),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftEnabled, routingMuteBoolean(state, 'driftEnabled')),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionEnabled, routingMuteBoolean(state, 'erosionEnabled')),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationEnabled, routingMuteBoolean(state, 'dynamicsSaturationEnabled')),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeEnabled, routingMuteBoolean(state, 'spectralFreezeEnabled')),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeActive, routingMuteBoolean(state, 'spectralFreezeActive')),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.FxReverbMix, routingMuteEffectiveReverbMix(state)),
  ];

  // The exact soundscape snapshot owns the aggregate gates and child active
  // values. Reuse its custom target layout so scene commands cannot drift from
  // snapshot loading.
  const soundscape = soundscapeSnapshotPayloadFromState(state as unknown as Record<string, unknown>);
  const module = (index: number): number => soundscape.moduleParams[index] ?? 0;
  const texture = (index: number): number => soundscape.textureParams[index] ?? 0;
  const moduleTarget = (index: number): number => CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + index;
  const textureTarget = (slot: number): number => CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE +
    SOUNDSCAPE_TEXTURE_PARAM_START + slot * SOUNDSCAPE_TEXTURE_PARAM_STRIDE + CORE_PRODUCT_SOUNDSCAPE_TEXTURE_ENABLED_PARAM_OFFSET;
  const soundscapeParam = (targetId: number, value: number): CoreProductEvent => (
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.SourceLevel, value, targetId)
  );
  commands.push(
    soundscapeParam(moduleTarget(CORE_PRODUCT_SOUNDSCAPE_WATER_ACTIVE_MODULE_PARAM_INDEX), module(CORE_PRODUCT_SOUNDSCAPE_WATER_ACTIVE_MODULE_PARAM_INDEX)),
    soundscapeParam(moduleTarget(CORE_PRODUCT_SOUNDSCAPE_WATER_MASTER_MODULE_PARAM_INDEX), module(CORE_PRODUCT_SOUNDSCAPE_WATER_MASTER_MODULE_PARAM_INDEX)),
    soundscapeParam(moduleTarget(CORE_PRODUCT_SOUNDSCAPE_INSECTS_ACTIVE_MODULE_PARAM_INDEX), module(CORE_PRODUCT_SOUNDSCAPE_INSECTS_ACTIVE_MODULE_PARAM_INDEX)),
    soundscapeParam(moduleTarget(CORE_PRODUCT_SOUNDSCAPE_INSECTS2_ACTIVE_MODULE_PARAM_INDEX), module(CORE_PRODUCT_SOUNDSCAPE_INSECTS2_ACTIVE_MODULE_PARAM_INDEX)),
    soundscapeParam(moduleTarget(CORE_PRODUCT_SOUNDSCAPE_INSECTS_MASTER_MODULE_PARAM_INDEX), module(CORE_PRODUCT_SOUNDSCAPE_INSECTS_MASTER_MODULE_PARAM_INDEX)),
    soundscapeParam(moduleTarget(CORE_PRODUCT_SOUNDSCAPE_NATURE_MASTER_MODULE_PARAM_INDEX), module(CORE_PRODUCT_SOUNDSCAPE_NATURE_MASTER_MODULE_PARAM_INDEX)),
  );
  for (let slot = 0; slot < 4; slot += 1) {
    const textureParamIndex = SOUNDSCAPE_TEXTURE_PARAM_START + slot * SOUNDSCAPE_TEXTURE_PARAM_STRIDE + CORE_PRODUCT_SOUNDSCAPE_TEXTURE_ENABLED_PARAM_OFFSET;
    commands.push(soundscapeParam(textureTarget(slot), texture(textureParamIndex)));
  }

  // Legacy Waves is represented as a soundscape asset level rather than a
  // source gate (the Product soundscape source remains a shared container).
  const oceanAssetId = CORE_PRODUCT_SOUNDSCAPE_ASSETS.ocean.assetId;
  const oceanLevel = state.oceanSampleEnabled === true && typeof state.oceanSampleLevel === 'number' && Number.isFinite(state.oceanSampleLevel)
    ? Math.max(0, Math.min(1, state.oceanSampleLevel))
    : 0;
  commands.push(soundscapeParam(CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE + oceanAssetId, oceanLevel));
  return commands;
}

function routingMuteSceneCommandRecord(slotIndex: number, command: CoreProductEvent): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetRoutingMuteGroupSlot,
    targetId: command.targetId ?? 0,
    index: slotIndex,
    paramId: command.paramId ?? 0,
    value: command.value ?? 0,
    value2: command.eventKind,
    value3: command.index ?? 0,
    value4: command.flags ?? 0,
    flags: CORE_PRODUCT_ROUTING_MUTE_SCENE_COMMAND_FLAG,
  };
}

function appendRoutingMuteSceneCommands(
  events: CoreProductEvent[],
  slotIndex: number,
  state: SliderState,
): void {
  const commands = routingMuteSceneCommands(state);
  if (commands.length > CORE_PRODUCT_ROUTING_MUTE_MAX_SCENE_COMMANDS) {
    throw new RangeError(`Routing mute group scene ${slotIndex === CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX ? 'baseline' : slotIndex} has ${commands.length} commands; maximum is ${CORE_PRODUCT_ROUTING_MUTE_MAX_SCENE_COMMANDS}`);
  }
  events.push(...commands.map((command) => routingMuteSceneCommandRecord(slotIndex, command)));
}

function routingMuteGroupRevision(groups: RoutingMuteGroupsState): number {
  const text = JSON.stringify(groups);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function routingMuteSequencerMasks(state: SliderState): {
  synth: number;
  drum: number;
  granular: number;
} {
  let synthEnabled = 0;
  let synthMuted = 0;
  let drumEnabled = 0;
  let drumMuted = 0;
  let granular = 0;
  for (let lane = 1; lane <= 4; lane += 1) {
    if (
      state.synthEuclideanMasterEnabled === true &&
      state[`synthEuclid${lane}Enabled` as keyof SliderState] === true
    ) synthEnabled |= 1 << (lane - 1);
    if (resolveSequencerLaneAudibility(state, 'synth', lane).muted) synthMuted |= 1 << (lane - 1);
    if (state[`granularV${lane}Enabled` as keyof SliderState] === true) granular |= 1 << (lane - 1);
  }
  for (let lane = 1; lane <= 6; lane += 1) {
    if (
      state.drumEnabled === true &&
      state.drumEuclidMasterEnabled === true &&
      state[`drumEuclid${lane}Enabled` as keyof SliderState] === true
    ) drumEnabled |= 1 << (lane - 1);
    if (resolveSequencerLaneAudibility(state, 'drum', lane).muted) drumMuted |= 1 << (lane - 1);
  }
  return {
    synth: synthEnabled | (synthMuted << 16),
    drum: drumEnabled | (drumMuted << 16),
    granular,
  };
}

export function createCoreProductRoutingMuteGroupEvents(
  groups: RoutingMuteGroupsState,
  options: { sampleRate: number; phraseSeconds: number; seed: number; state: SliderState },
): CoreProductEvent[] {
  if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0) {
    throw new RangeError('Routing mute groups require a positive sample rate');
  }
  if (!Number.isFinite(options.phraseSeconds) || options.phraseSeconds <= 0) {
    throw new RangeError('Routing mute groups require a positive phrase duration');
  }
  const random = groups.random;
  const eligible = random?.eligibleSlotIndexes ? new Set(random.eligibleSlotIndexes) : null;
  const defaultMin = random?.defaultMinPhrases ?? 2;
  const defaultMax = random?.defaultMaxPhrases ?? 6;
  const transitionFrames = Math.round(
    Math.max(0.25, random?.transitionPhrases ?? 1) * options.phraseSeconds * options.sampleRate,
  );
  const baselineMasks = routingMuteSequencerMasks(options.state);
  const events: CoreProductEvent[] = [{
    eventKind: KESSHO_PRODUCT_EVENT_IDS.BeginRoutingMuteGroups,
    targetId: baselineMasks.synth,
    index: baselineMasks.drum,
    paramId: baselineMasks.granular,
    value: routingMuteGroupRevision(groups),
    value2: Math.max(1, options.seed >>> 0),
    value3: random?.avoidRepeat === false ? 0 : 1,
    value4: random?.enabled === true ? 1 : 0,
  }];
  appendRoutingMuteSceneCommands(events, CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX, options.state);
  groups.slots.slice(0, 8).forEach((slot, index) => {
    if (!slot) return;
    const range = slot.phraseRange ?? { min: defaultMin, max: defaultMax };
    const muteMask = slot.mutedSourceIds.reduce((mask, id) => (
      mask | (CORE_PRODUCT_ROUTING_MUTE_ROW_BITS[id] ?? 0)
    ), 0);
    const sceneState = routingMuteSceneState(options.state, slot.statePatch);
    const sceneMasks = routingMuteSequencerMasks(sceneState);
    events.push({
      eventKind: KESSHO_PRODUCT_EVENT_IDS.SetRoutingMuteGroupSlot,
      targetId: muteMask,
      index,
      paramId: sceneMasks.synth,
      value: Math.max(1, Math.round(range.min * 4)),
      value2: Math.max(1, Math.round(range.max * 4)),
      value3: transitionFrames,
      value4: sceneMasks.drum,
      flags: (eligible === null || eligible.has(index) ? 1 : 0) | (sceneMasks.granular << 8),
    });
    appendRoutingMuteSceneCommands(events, index, sceneState);
  });
  events.push({ eventKind: KESSHO_PRODUCT_EVENT_IDS.CommitRoutingMuteGroups });
  return events;
}

export function createCoreProductRoutingMuteGroupRecallEvent(
  slotIndex: number | null,
  transitionFrames: number,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.RecallRoutingMuteGroup,
    index: slotIndex === null ? 0xffffffff : slotIndex,
    value: Math.max(0, Math.round(transitionFrames)),
  };
}

export function createCoreProductRoutingMuteGroupsEnabledEvent(enabled: boolean): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetRoutingMuteGroupsEnabled,
    value: enabled ? 1 : 0,
  };
}

export const CORE_PRODUCT_TIMING_FLAGS = CORE_PRODUCT_TRANSPORT_FLAGS;

export type CoreProductTimingApplyPolicy = 'live' | 'nextPhrase';

function timingApplyFlags(policy: CoreProductTimingApplyPolicy): number {
  return policy === 'nextPhrase' ? CORE_PRODUCT_TIMING_FLAGS.applyNextPhrase : 0;
}

export const CORE_PRODUCT_ANCHOR_WALKER_ACTIONS = Object.freeze({
  gestureTap: 1,
  gestureDown: 2,
  gestureUp: 3,
  resetCursor: 4,
  setManualAnchor: 5,
} as const);

export const CORE_PRODUCT_STEP_TOGGLE_FLAGS = Object.freeze({
  active: 1,
  clearLane: 2,
  clearField: 4,
  rangeValue: 8,
  subLaneEnabledState: 1 << 24,
  stepOverrideState: 1 << 25,
  drumPitchOffsetValue: 1 << 26,
  stepOverrideCommit: 1 << 27,
  homeCaptureState: 1 << 28,
} as const);

export const CORE_PRODUCT_HOME_CAPTURE_FLAGS = Object.freeze({
  force: 1 << 0,
  requireContent: 1 << 1,
  hasPitchState: 1 << 2,
  pitchScaleQuantize: 1 << 3,
  pitchScaleQuantizeSet: 1 << 4,
} as const);

export const CORE_PRODUCT_HOST_PARAM_IDS = Object.freeze({
  SequencerEvolveConfig: -1000,
} as const);

export const CORE_PRODUCT_DICE_FLAGS = Object.freeze({
  trigger: 1 << 0,
  probability: 1 << 1,
  ratchet: 1 << 2,
  midiNote: 1 << 3,
  expression: 1 << 4,
  morph: 1 << 5,
  distance: 1 << 6,
  swing: 1 << 7,
} as const);

export const CORE_PRODUCT_EVOLVE_FLAGS = Object.freeze({
  rotateDrift: 1 << 8,
  swingDrift: 1 << 9,
  probDrift: 1 << 10,
  ghostNotes: 1 << 11,
  ratchetSpray: 1 << 12,
  hitDrift: 1 << 13,
  pitchWalk: 1 << 14,
  valueDrift: 1 << 15,
  valueScramble: 1 << 16,
  valueWiden: 1 << 17,
  subLaneLengthDrift: 1 << 18,
  subLaneDirectionFlip: 1 << 19,
  triggerToggle: 1 << 20,
  evolveConfigSubLaneMask: 1 << 27,
  manualCommit: 1 << 28,
  mutationStrict: 1 << 29,
  rngStream: 1 << 30,
  modeParity: 0x80000000,
} as const);

export const CORE_PRODUCT_EVOLVE_TENSION_PARAM_SCALE = 1000;

export function encodeCoreProductSequencerEvolveTension(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return 1 + Math.round(Math.max(0, Math.min(1, value)) * CORE_PRODUCT_EVOLVE_TENSION_PARAM_SCALE);
}

export const CORE_PRODUCT_STEP_VALUE_FIELDS = Object.freeze({
  trigger: 0 << 8,
  probability: 1 << 8,
  ratchet: 2 << 8,
  trigCondition: 3 << 8,
  midiNote: 4 << 8,
  expression: 5 << 8,
  morph: 6 << 8,
  distance: 7 << 8,
  nudge: 8 << 8,
  subLaneConfig: 9 << 8,
  playNote: 10 << 8,
} as const);

export const CORE_PRODUCT_SUBLANE_DIRECTIONS = Object.freeze({
  forward: 0,
  reverse: 1,
  pingpong: 2,
} as const);

export const CORE_PRODUCT_DRUM_RANGE_TARGET_BASE = 1000;
export const CORE_PRODUCT_PAD_RUNTIME_PARAM_ID_BASE = 2000;
export const CORE_PRODUCT_PAD2_RUNTIME_PARAM_ID_BASE = 2100;
export const CORE_PRODUCT_LEAD_RUNTIME_PARAM_ID_BASE = 2200;
export const CORE_PRODUCT_LEAD2_RUNTIME_PARAM_ID_BASE = 2300;
export const CORE_PRODUCT_DRUM_RUNTIME_PARAM_ID_BASE = 3000;
const CORE_PRODUCT_DRUM_MASTER_LEVEL_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumLevel');
const CORE_PRODUCT_DRUM_REVERB_SEND_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumReverbSend');

const VALID_SOURCE_IDS = new Set<number>(Object.values(CORE_PRODUCT_SOURCE_IDS));
const CORE_PRODUCT_MAX_SOURCE_ID = Math.max(...VALID_SOURCE_IDS);
const VALID_SEQUENCER_IDS = new Set<number>(Object.values(CORE_PRODUCT_SEQUENCER_IDS));
const CORE_PRODUCT_PAD_RUNTIME_PARAM_IDS = Array.from(
  { length: KESSHO_PRODUCT_PAD_PARAM_COUNT * 2 },
  (_, index) => (
    index < KESSHO_PRODUCT_PAD_PARAM_COUNT
      ? CORE_PRODUCT_PAD_RUNTIME_PARAM_ID_BASE + index
      : CORE_PRODUCT_PAD2_RUNTIME_PARAM_ID_BASE + index - KESSHO_PRODUCT_PAD_PARAM_COUNT
  ),
);
const CORE_PRODUCT_DRUM_RUNTIME_PARAM_IDS = Array.from(
  { length: KESSHO_PRODUCT_DRUM_PARAM_COUNT },
  (_, index) => CORE_PRODUCT_DRUM_RUNTIME_PARAM_ID_BASE + index,
);
const CORE_PRODUCT_LEAD_RUNTIME_PARAM_IDS = Array.from(
  { length: KESSHO_PRODUCT_LEAD_PARAM_COUNT * 2 },
  (_, index) => (
    index < KESSHO_PRODUCT_LEAD_PARAM_COUNT
      ? CORE_PRODUCT_LEAD_RUNTIME_PARAM_ID_BASE + index
      : CORE_PRODUCT_LEAD2_RUNTIME_PARAM_ID_BASE + index - KESSHO_PRODUCT_LEAD_PARAM_COUNT
  ),
);
const VALID_PARAM_IDS = new Set<number>([
  ...Object.values(KESSHO_PRODUCT_PARAM_IDS),
  ...CORE_PRODUCT_PAD_RUNTIME_PARAM_IDS,
  ...CORE_PRODUCT_LEAD_RUNTIME_PARAM_IDS,
  ...CORE_PRODUCT_DRUM_RUNTIME_PARAM_IDS,
]);
const VALID_STEP_FIELDS = new Set<number>(Object.values(CORE_PRODUCT_STEP_VALUE_FIELDS));
const VALID_SUBLANE_DIRECTIONS = new Set<number>(Object.values(CORE_PRODUCT_SUBLANE_DIRECTIONS));
const CORE_PRODUCT_PAD_VOICE_EVENT_FLAG = 0x80000000;
const CORE_PRODUCT_PAD_VOICE_EVENT_SHIFT = 24;
const CORE_PRODUCT_SOURCE_PRESET_ENDPOINT_HAS_MORPH_FLAG = 1;
export const CORE_PRODUCT_SOURCE_OVERRIDE_FLAGS = Object.freeze({
  setSlot: 1 << 0,
  commit: 1 << 1,
  morphAnchored: 1 << 2,
} as const);

function productBridgeError(message: string): Error {
  return new Error(`Invalid Core Product bridge event: ${message}`);
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw productBridgeError(`${label} must be a finite number`);
  }
  return value;
}

function requireIntegerInRange(value: unknown, label: string, min: number, max: number): number {
  const numeric = requireFiniteNumber(value, label);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw productBridgeError(`${label} must be an integer in [${min}, ${max}]`);
  }
  return numeric;
}

function requireUnitValue(value: unknown, label: string): number {
  const numeric = requireFiniteNumber(value, label);
  if (numeric < 0 || numeric > 1) {
    throw productBridgeError(`${label} must be in [0, 1]`);
  }
  return numeric;
}

function requirePositiveUnitValue(value: unknown, label: string): number {
  const numeric = requireUnitValue(value, label);
  if (numeric <= 0) {
    throw productBridgeError(`${label} must be greater than zero`);
  }
  return numeric;
}

function requireNumberInRange(value: unknown, label: string, min: number, max: number): number {
  const numeric = requireFiniteNumber(value, label);
  if (numeric < min || numeric > max) {
    throw productBridgeError(`${label} must be in [${min}, ${max}]`);
  }
  return numeric;
}

function requirePositiveFinite(value: unknown, label: string): number {
  const numeric = requireFiniteNumber(value, label);
  if (numeric <= 0) {
    throw productBridgeError(`${label} must be greater than zero`);
  }
  return numeric;
}

function requireSourceId(sourceId: unknown, label = 'sourceId'): number {
  const value = requireIntegerInRange(sourceId, label, 1, CORE_PRODUCT_MAX_SOURCE_ID);
  if (!VALID_SOURCE_IDS.has(value)) {
    throw productBridgeError(`${label} is not a known product source: ${String(sourceId)}`);
  }
  return value;
}

function requireManualNoteOffSourceId(sourceId: unknown): number {
  if (sourceId === 0) return 0;
  return requireSourceId(sourceId);
}

function coreProductSourceOverrideParamCount(sourceId: number): number {
  switch (sourceId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
    case CORE_PRODUCT_SOURCE_IDS.pad2:
      return KESSHO_PRODUCT_PAD_PARAM_COUNT;
    case CORE_PRODUCT_SOURCE_IDS.lead1:
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      return KESSHO_PRODUCT_LEAD_PARAM_COUNT;
    case CORE_PRODUCT_SOURCE_IDS.drum:
      return KESSHO_PRODUCT_DRUM_PARAM_COUNT;
    default:
      return 0;
  }
}

function coreProductPadVoiceEventFlags(voiceIndex: number | undefined): number {
  if (voiceIndex === undefined) return 0;
  const value = requireIntegerInRange(voiceIndex, 'padVoiceIndex', 0, 7);
  return (CORE_PRODUCT_PAD_VOICE_EVENT_FLAG | ((value + 1) << CORE_PRODUCT_PAD_VOICE_EVENT_SHIFT)) >>> 0;
}

function requireDrumVoiceIndex(voiceIndex: unknown, label = 'voiceIndex'): number {
  return requireIntegerInRange(voiceIndex, label, 0, KESSHO_PRODUCT_DRUM_VOICE_COUNT - 1);
}

function requireSequencerId(sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS): number {
  if (!Object.prototype.hasOwnProperty.call(CORE_PRODUCT_SEQUENCER_IDS, sequencer)) {
    throw productBridgeError(`sequencer is not known: ${String(sequencer)}`);
  }
  const sequencerId = CORE_PRODUCT_SEQUENCER_IDS[sequencer];
  if (!VALID_SEQUENCER_IDS.has(sequencerId)) {
    throw productBridgeError(`sequencer id is not known: ${String(sequencerId)}`);
  }
  return sequencerId;
}

function requireParamId(paramId: unknown, label = 'paramId'): number {
  const value = requireIntegerInRange(paramId, label, 1, Number.MAX_SAFE_INTEGER);
  if (!VALID_PARAM_IDS.has(value)) {
    throw productBridgeError(`${label} is not a known product param: ${String(paramId)}`);
  }
  return value;
}

function requireStepField(field: unknown): CoreProductStepValueField {
  const value = requireIntegerInRange(field, 'field', 0, 10 << 8);
  if (!VALID_STEP_FIELDS.has(value)) {
    throw productBridgeError(`field is not a known sequencer step field: ${String(field)}`);
  }
  return value as CoreProductStepValueField;
}

function requireSubLaneDirection(direction: unknown): CoreProductSubLaneDirection {
  const value = requireIntegerInRange(direction, 'direction', 0, 2);
  if (!VALID_SUBLANE_DIRECTIONS.has(value)) {
    throw productBridgeError(`direction is not a known sub-lane direction: ${String(direction)}`);
  }
  return value as CoreProductSubLaneDirection;
}

export type CoreProductModulationRangeMode =
  (typeof CORE_PRODUCT_MODULATION_RANGE_MODE)[keyof typeof CORE_PRODUCT_MODULATION_RANGE_MODE];

export type CoreProductStepValueField =
  (typeof CORE_PRODUCT_STEP_VALUE_FIELDS)[keyof typeof CORE_PRODUCT_STEP_VALUE_FIELDS];

export type CoreProductSubLaneDirection =
  (typeof CORE_PRODUCT_SUBLANE_DIRECTIONS)[keyof typeof CORE_PRODUCT_SUBLANE_DIRECTIONS];

export type CoreProductAnchorWalkerPerformanceAction =
  keyof typeof CORE_PRODUCT_ANCHOR_WALKER_ACTIONS;

export type CoreProductRangeTarget = {
  targetId: number;
  paramId: number;
  controlId: number;
  sampleHoldTrigger?: CoreProductSampleHoldTriggerBus;
  mapValue?: (value: number, context: CoreProductRangeValueContext) => number;
};

export type CoreProductRangeValueContext = {
  bpm?: number;
  speed?: number;
  mode?: 'localBrownian' | 'globalWalk' | string;
  randomWalkSpeed?: number;
  randomWalkMode?: 'localBrownian' | 'globalWalk' | string;
  runtimeModulation?: ProductRuntimeModulationConfig;
  state?: Record<string, unknown> | null;
};

type CoreProductSampleHoldTriggerBus = 'delayA' | 'delayB' | 'granular' | 'reverb';
type CoreProductRangeTargetResolver = (key: string) => CoreProductRangeTarget[];
type ProductParamIdName = keyof typeof KESSHO_PRODUCT_PARAM_IDS;

export const CORE_PRODUCT_ARRANGEMENT_RUNTIME_WALK_KEYS = [
  'chordRate',
  'voicingSpread',
  'waveSpread',
  'detune',
  'synthOctave',
  'lead1Density',
  'lead1Octave',
  'lead1OctaveRange',
] as const;

export const CORE_PRODUCT_LIVE_TRIGGER_RUNTIME_WALK_KEYS = [
  'lead1Distance',
  'lead2Distance',
  'padDistance',
  'pad2Distance',
  'sample1Distance',
  'sample2Distance',
] as const;

export function isCoreProductArrangementRuntimeWalkKey(key: string): key is typeof CORE_PRODUCT_ARRANGEMENT_RUNTIME_WALK_KEYS[number] {
  return (CORE_PRODUCT_ARRANGEMENT_RUNTIME_WALK_KEYS as readonly string[]).includes(key);
}

export function isCoreProductRuntimeWalkStatePatchKey(key: string): boolean {
  return isCoreProductArrangementRuntimeWalkKey(key) ||
    (CORE_PRODUCT_LIVE_TRIGGER_RUNTIME_WALK_KEYS as readonly string[]).includes(key);
}

function stableControlId(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

export function coreProductPadRuntimeParamId(padIndex: 0 | 1, paramIndex: number): number {
  const base = padIndex === 0 ? CORE_PRODUCT_PAD_RUNTIME_PARAM_ID_BASE : CORE_PRODUCT_PAD2_RUNTIME_PARAM_ID_BASE;
  return base + requireIntegerInRange(paramIndex, 'pad param index', 0, KESSHO_PRODUCT_PAD_PARAM_COUNT - 1);
}

export function coreProductDrumRuntimeParamId(paramIndex: number): number {
  return CORE_PRODUCT_DRUM_RUNTIME_PARAM_ID_BASE +
    requireIntegerInRange(paramIndex, 'drum param index', 0, KESSHO_PRODUCT_DRUM_PARAM_COUNT - 1);
}

export function coreProductLeadRuntimeParamId(leadIndex: 0 | 1, paramIndex: number): number {
  const base = leadIndex === 0 ? CORE_PRODUCT_LEAD_RUNTIME_PARAM_ID_BASE : CORE_PRODUCT_LEAD2_RUNTIME_PARAM_ID_BASE;
  return base + requireIntegerInRange(paramIndex, 'lead param index', 0, KESSHO_PRODUCT_LEAD_PARAM_COUNT - 1);
}

function sourceTarget(
  sourceId: number,
  paramId: number,
  key: string,
  mapValue?: (value: number, context: CoreProductRangeValueContext) => number,
): CoreProductRangeTarget {
  return { targetId: requireSourceId(sourceId), paramId: requireParamId(paramId), controlId: stableControlId(key), mapValue };
}

function drumTarget(voiceIndex: number, paramId: number, key: string): CoreProductRangeTarget {
  return {
    targetId: CORE_PRODUCT_DRUM_RANGE_TARGET_BASE + requireDrumVoiceIndex(voiceIndex),
    paramId: requireParamId(paramId),
    controlId: stableControlId(key),
  };
}

function drumExactTarget(voiceIndex: number, paramIndex: number, key: string): CoreProductRangeTarget {
  return drumTarget(voiceIndex, coreProductDrumRuntimeParamId(paramIndex), key);
}

function productParamTarget(
  paramId: number,
  key: string,
  mapValue?: (value: number, context: CoreProductRangeValueContext) => number,
): CoreProductRangeTarget {
  return {
    targetId: 0,
    paramId: requireParamId(paramId),
    controlId: stableControlId(key),
    sampleHoldTrigger: coreProductSampleHoldTriggerForKey(key),
    mapValue,
  };
}

function controlOnlyRangeTarget(paramId: number, key: string): CoreProductRangeTarget {
  return {
    targetId: CORE_PRODUCT_CONTROL_ONLY_MODULATION_TARGET_ID,
    paramId: requireParamId(paramId),
    controlId: stableControlId(key),
  };
}

function soundscapeAssetLevelTarget(
  assetId: number,
  key: string,
  mapValue?: (value: number, context: CoreProductRangeValueContext) => number,
): CoreProductRangeTarget {
  const safeAssetId = requireIntegerInRange(assetId, 'assetId', 1, 0x00ffffff);
  return {
    targetId: CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE + safeAssetId,
    paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel,
    controlId: stableControlId(key),
    mapValue,
  };
}

function soundscapeTextureLevelTarget(
  slotIndex: number,
  key: string,
  mapValue?: (value: number, context: CoreProductRangeValueContext) => number,
): CoreProductRangeTarget {
  return {
    targetId: CORE_PRODUCT_SOUNDSCAPE_TEXTURE_LEVEL_RANGE_TARGET_BASE +
      requireIntegerInRange(slotIndex, 'soundscape texture slot', 0, 3),
    paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel,
    controlId: stableControlId(key),
    mapValue,
  };
}

function soundscapeTextureParamTarget(
  slotIndex: number,
  paramIndex: number,
  key: string,
): CoreProductRangeTarget {
  const slot = requireIntegerInRange(slotIndex, 'soundscape texture slot', 0, 3);
  const parameter = requireIntegerInRange(paramIndex, 'soundscape texture parameter', 0, SOUNDSCAPE_TEXTURE_PARAM_STRIDE - 1);
  return {
    targetId: CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE +
      SOUNDSCAPE_TEXTURE_PARAM_START + slot * SOUNDSCAPE_TEXTURE_PARAM_STRIDE + parameter,
    // Texture parameter targets are stored in the soundscape source's texture
    // parameter array. SourceLevel is the modulation ABI parameter for these
    // custom targets; the target id selects the actual texture parameter.
    paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel,
    controlId: stableControlId(key),
  };
}

function soundscapeModuleParamTarget(paramIndex: number, key: string): CoreProductRangeTarget {
  return {
    targetId: CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE +
      requireIntegerInRange(
        paramIndex,
        'soundscape module parameter',
        0,
        KESSHO_PRODUCT_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT - 1,
      ),
    // SourceLevel is the modulation ABI parameter for custom soundscape targets;
    // the target id selects the exact module parameter.
    paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel,
    controlId: stableControlId(key),
  };
}

const SOUNDSCAPE_MODULE_RANGE_PARAM_INDICES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  waterIntensity: [2, 3],
  waterDistance: [4, 5],
  waterHardDropBaseFreq: [6, 7],
  waterWaterDropBaseFreq: [8, 9],
  waterDropSize: [10, 11],
  waterHardness: [12, 13],
  waterGlassThickness: [14, 15],
  waterHardDropRate: [16],
  waterHardDropLPF: [17],
  waterHardDropTone: [18],
  waterWaterDropRate: [19],
  waterWaterDropLPF: [20],
  waterBubblingRate: [21],
  waterBubblingLPF: [22],
  waterLayerHardDrops: [SOUNDSCAPE_WATER_LAYER_PARAM_START],
  waterLayerWaterDrops: [SOUNDSCAPE_WATER_LAYER_PARAM_START + 1],
  waterLayerTurbulence: [SOUNDSCAPE_WATER_LAYER_PARAM_START + 2],
  waterLayerBubbling: [SOUNDSCAPE_WATER_LAYER_PARAM_START + 3],
  waterLayerSurf: [SOUNDSCAPE_WATER_LAYER_PARAM_START + 4],
  waterLayerChannels: [SOUNDSCAPE_WATER_LAYER_PARAM_START + 5],
  waterDensityHardSend: [35],
  waterDensityWaterSend: [36],
  waterDensityBubbleSend: [37],
  waterDensityFeedback: [38],
  waterDensityTone: [39],
  waterDensityRing: [40],
  waterDensityWet: [41],
  waterSurfDuration: [42, 43],
  waterSurfInterval: [44, 45],
  waterSurfFoam: [46, 47],
  waterSurfProximity: [48, 49],
  waterSurfDepth: [50, 51],
  waterSurfBody: [52, 53],
  waterSurfSpray: [54, 55],
  waterSurfFoamBright: [56, 57],
  waterChannelsMorph: [58],
  waterChannelsSpeed: [59],
  insectsDensity: [63, 64],
  insectsTemperature: [65, 66],
  insectsDistance: [67, 68],
  insectsProximity: [69, 70],
  insectsAntiphony: [71, 72],
  insectsClickRate: [73, 74],
  insectsMotion: [75, 76],
  insects2Density: [80, 81],
  insects2Temperature: [82, 83],
  insects2Distance: [84, 85],
  insects2Proximity: [86, 87],
  insects2Antiphony: [88, 89],
  insects2ClickRate: [90, 91],
  insects2Motion: [92, 93],
  waterLevel: [96],
  insectsLevel: [97],
  insects2Level: [98],
  insectsSharedLevel: [99],
  earthLevel: [100],
});

function soundscapeModuleRangeTargets(): Record<string, CoreProductRangeTargetResolver> {
  return Object.fromEntries(
    Object.entries(SOUNDSCAPE_MODULE_RANGE_PARAM_INDICES).map(([stateKey, indices]) => [
      stateKey,
      (key: string) => indices.map((index) => soundscapeModuleParamTarget(index, key)),
    ]),
  );
}

function delayBTapeHeadMaskMap(headIndex: number): (value: number, context: CoreProductRangeValueContext) => number {
  return (value, context) => {
    let mask = 0;
    for (let index = 0; index < 4; index += 1) {
      const stateKey = `delayBTapeHead${index + 1}Enabled`;
      const stateValue = context.state?.[stateKey];
      const active = index === headIndex
        ? value >= 0.5
        : typeof stateValue === 'boolean' ? stateValue : true;
      if (active) mask |= 1 << index;
    }
    return mask;
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function binaryParamValue(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function dynamicsEqEdgeTypeValue(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function integerEnumParamValue(max: number): (value: number) => number {
  return (value) => {
    if (!Number.isFinite(value)) return 0;
    const scaled = value >= 0 && value <= 1 ? value * max : value;
    return clamp(Math.round(scaled), 0, max);
  };
}

function stateBackedEnumParamValue(
  key: string,
  mapStateValue: (value: unknown) => number,
  max: number,
): (value: number, context: CoreProductRangeValueContext) => number {
  const fallback = integerEnumParamValue(max);
  return (value, context) => {
    const stateValue = context.state?.[key];
    if (typeof stateValue === 'string') return mapStateValue(stateValue);
    return fallback(value);
  };
}

function dynamicsBusParamValue(value: number): number {
  return clamp(Math.round(value), 0, 3);
}

function soundscapeNatureAssetLevelMap(value: number, context: CoreProductRangeValueContext): number {
  const natureLevel = context.state?.natureLevel;
  const multiplier = typeof natureLevel === 'number' && Number.isFinite(natureLevel)
    ? natureLevel
    : 1;
  return clamp(value * multiplier, 0, 2);
}

function soundscapeNatureMasterAssetLevelMap(stateKey: string): (value: number, context: CoreProductRangeValueContext) => number {
  return (value, context) => {
    const sourceLevel = context.state?.[stateKey];
    const multiplier = typeof sourceLevel === 'number' && Number.isFinite(sourceLevel)
      ? sourceLevel
      : 0;
    return clamp(value * multiplier, 0, 2);
  };
}

function soundscapeNatureTextureLevelMap(value: number, context: CoreProductRangeValueContext): number {
  const natureLevel = context.state?.natureLevel;
  return clamp(value * (typeof natureLevel === 'number' && Number.isFinite(natureLevel) ? natureLevel : 1), 0, 1);
}

function soundscapeNatureMasterTextureLevelMap(stateKey: string): (value: number, context: CoreProductRangeValueContext) => number {
  return (value, context) => {
    const slotLevel = context.state?.[stateKey];
    return clamp(value * (typeof slotLevel === 'number' && Number.isFinite(slotLevel) ? slotLevel : 0), 0, 1);
  };
}

function mapPadExactValueForDistance(
  padIndex: 0 | 1,
  key: string,
  value: number,
  context: CoreProductRangeValueContext,
): number {
  const state = context.state;
  if (!state) return value;
  const voice = padIndex === 0 ? 'pad1' : 'pad2';
  const distanceKey = padIndex === 0 ? 'padDistance' : 'pad2Distance';
  const distanceValue = state[distanceKey];
  const distance = typeof distanceValue === 'number' && Number.isFinite(distanceValue)
    ? distanceValue
    : 0;
  if (distance <= 1e-4) return value;
  const distanceState = {
    ...DEFAULT_STATE,
    ...state,
    [key]: value,
    [distanceKey]: distance,
  } as SliderState;
  const adjusted = applyPadDistanceToState(distanceState, voice, distance)[key as keyof SliderState];
  return typeof adjusted === 'number' && Number.isFinite(adjusted) ? adjusted : value;
}

function coreProductRandomWalkFlags(context: CoreProductRangeValueContext): number {
  const config = context.runtimeModulation?.mode === 'walk' ? context.runtimeModulation : null;
  const speed = clamp(config?.speed ?? context.randomWalkSpeed ?? context.speed ?? 1, 0.01, 5);
  const encodedSpeed = Math.round(speed * CORE_PRODUCT_MODULATION_RANGE_FLAGS.randomWalkSpeedScale);
  const speedFlags = encodedSpeed * (2 ** CORE_PRODUCT_MODULATION_RANGE_FLAGS.randomWalkSpeedShift);
  const modeFlags = config?.relationship === 'link' || (!config && (context.randomWalkMode ?? context.mode) === 'globalWalk')
    ? CORE_PRODUCT_MODULATION_RANGE_FLAGS.randomWalkGlobal
      | (CORE_PRODUCT_SHAPE_TIMING_IDS.link << CORE_PRODUCT_MODULATION_RANGE_FLAGS.timingShift)
    : 0;
  const sourceFlags = config?.source === 'b' ? CORE_PRODUCT_MODULATION_RANGE_FLAGS.modulationSourceB : 0;
  return speedFlags | modeFlags | sourceFlags;
}

const CORE_PRODUCT_SHAPE_IDS = Object.freeze({ sine: 0, triangle: 1, square: 2 } as const);
const CORE_PRODUCT_SHAPE_TIMING_IDS = Object.freeze({ free: 0, link: 1, sync: 2 } as const);
const CORE_PRODUCT_SHAPE_DIVISION_IDS = Object.freeze({
  '4x': 0,
  '2x': 1,
  '1': 2,
  '1/2': 3,
  '1/4': 4,
  '1/8': 5,
  '1/16': 6,
} as const);

function coreProductShapeLfoFlags(context: CoreProductRangeValueContext): number {
  const config = context.runtimeModulation?.mode === 'shape' ? context.runtimeModulation : null;
  if (!config) return 0;
  const shapeFlags = CORE_PRODUCT_SHAPE_IDS[config.shape] << CORE_PRODUCT_MODULATION_RANGE_FLAGS.shapeShift;
  const timingFlags = CORE_PRODUCT_SHAPE_TIMING_IDS[config.timing.mode] << CORE_PRODUCT_MODULATION_RANGE_FLAGS.timingShift;
  const sourceFlags = config.source === 'b' ? CORE_PRODUCT_MODULATION_RANGE_FLAGS.modulationSourceB : 0;
  if (config.timing.mode === 'sync') {
    const referenceFlags = config.timing.reference === 'phrase'
      ? CORE_PRODUCT_MODULATION_RANGE_FLAGS.syncReferencePhrase
      : 0;
    const divisionFlags = CORE_PRODUCT_SHAPE_DIVISION_IDS[config.timing.division]
      << CORE_PRODUCT_MODULATION_RANGE_FLAGS.syncDivisionShift;
    return shapeFlags | timingFlags | referenceFlags | divisionFlags | sourceFlags;
  }
  const speed = clamp(config.timing.speed, 0.01, 5);
  const encodedSpeed = Math.round(speed * CORE_PRODUCT_MODULATION_RANGE_FLAGS.randomWalkSpeedScale);
  return shapeFlags
    | timingFlags
    | sourceFlags
    | encodedSpeed * (2 ** CORE_PRODUCT_MODULATION_RANGE_FLAGS.randomWalkSpeedShift);
}

function normalizedToDelayAModRateHz(value: number): number {
  return 0.05 + clamp(value, 0, 1) * 4.95;
}

function normalizedToDelayAModDepthMs(value: number): number {
  return clamp(value, 0, 1) * 50;
}

function normalizedToDelayACrossFeedFilterHz(value: number): number {
  return 200 + clamp(value, 0, 1) * 7800;
}

function normalizedToDrumDelayFilterHz(value: number): number {
  return 500 * Math.pow(32, clamp(value, 0, 1));
}

function spectralFreezeRoutingValue(value: number | string): number {
  return value === 'post' || Number(value) >= 0.5 ? 1 : 0;
}

function spectralFreezeModeValue(value: number | string): number {
  if (value === 'solid') return 0;
  if (value === 'slushy') return 1;
  if (value === 'livingStretch') return 3;
  return typeof value === 'number' ? clamp(Math.round(value), 0, 3) : 2;
}

function spectralFreezeDirectionValue(value: number | string): number {
  if (value === 'forward') return 0;
  if (value === 'reverse') return 1;
  return typeof value === 'number' ? clamp(Math.round(value), 0, 2) : 2;
}

function contextBpm(context: CoreProductRangeValueContext): number {
  return clamp(context.bpm ?? 120, 1, 400);
}

function indexedDelayDivisionMs(key: IndexedDelayDivisionKey, minMs: number) {
  return (value: number, context: CoreProductRangeValueContext): number => {
    const division = getIndexedDelayDivisionValue(key, value);
    return clamp(delayNoteToSeconds(division, contextBpm(context)) * 1000, minMs, 5000);
  };
}

function numericContextStateValue(state: Partial<SliderState>, key: keyof SliderState, fallback: number): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function granularMacroModelForRangeValue(
  key: string,
  value: number,
  context: CoreProductRangeValueContext,
): GranularMacroModel {
  const state = {
    ...DEFAULT_STATE,
    ...(context.state ?? {}),
    [key]: value,
  } as SliderState;
  return computeGranularMacroModel(state, (stateKey, fallback) => numericContextStateValue(state, stateKey, fallback));
}

function granularMacroMap(
  key: string,
  select: (model: GranularMacroModel) => number,
): (value: number, context: CoreProductRangeValueContext) => number {
  return (value, context) => select(granularMacroModelForRangeValue(key, value, context));
}

function granularLevelMap(
  key: string,
): (value: number, context: CoreProductRangeValueContext) => number {
  return (value, context) => {
    const model = granularMacroModelForRangeValue(key, value, context);
    return clamp(value * ENGINE_TRIMS.granular * model.directLevelScale, 0, 4);
  };
}

function granularSendTrim(value: number): number {
  return clamp(value * ENGINE_TRIMS.granular, 0, 4);
}

function granularMacroVoiceMap(
  key: string,
  select: (model: GranularMacroModel, voiceIndex: number) => number,
  voiceIndex: number,
): (value: number, context: CoreProductRangeValueContext) => number {
  return (value, context) => select(granularMacroModelForRangeValue(key, value, context), voiceIndex);
}

const CORE_PRODUCT_REVERB_OWNERSHIP_KEYS = new Set<string>([
  'reverbLevel',
  'reverbDecay',
  'reverbSize',
  'reverbDiffusion',
  'reverbModulation',
  'predelay',
  'damping',
  'width',
  'reverbShimmer',
  'reverbShimmerPitch',
  'reverbSlowModRate',
  'reverbSlowModDepth',
  'reverbReverse',
  'reverbReverseLength',
  'reverbChorusRate',
  'reverbChorusDepth',
  'reverbDampLow',
  'reverbDampHigh',
  'reverbCrossoverFreq',
  'reverbInputTone',
  'reverbShimmerFeedback',
  'reverbBloom',
  'reverbWarp',
  'reverbCrossFeed',
  'reverbEarlyReflections',
  'reverbAirAbsorption',
  'reverbTransientSmooth',
  'reverbErLpFreq',
  'reverbPreCompThreshold',
  'reverbPreCompKnee',
  'reverbPreCompRatio',
  'reverbPreCompAttackMs',
  'reverbPreCompReleaseMs',
  'reverbPreCompMakeup',
]);

const CORE_PRODUCT_GRANULAR_OWNERSHIP_PREFIX_EXCLUSIONS = [
  'granularPad',
  'granularLead',
  'granularDrum',
  'granularWaves',
  'granularWater',
  'granularInsects',
  'granularDelay',
] as const;

function coreProductSampleHoldTriggerForKey(key: string): CoreProductSampleHoldTriggerBus | undefined {
  if (key === 'drumDelayNoteL' || key === 'drumDelayNoteR') {
    return 'delayA';
  }
  if (key.startsWith('delayA')) {
    if (
      key === 'delayATime' ||
      key === 'delayASpread' ||
      key === 'delayAPingPong' ||
      key === 'delayAFilterType' ||
      key === 'delayAEnabled' ||
      key === 'delayASend'
    ) {
      return undefined;
    }
    return 'delayA';
  }
  if (key.startsWith('granularDelay')) {
    return key === 'granularDelayEnabled' ? undefined : 'delayB';
  }
  if (
    key === 'delayBGranularSend' ||
    key === 'delayBToASend' ||
    key === 'delayBAlgorithm' ||
    key === 'delayBTapeSpacing' ||
    key === 'delayBWarpIntensity' ||
    key === 'delayBSpread' ||
    key.startsWith('delayBTapeHead')
  ) {
    return 'delayB';
  }
  if (CORE_PRODUCT_REVERB_OWNERSHIP_KEYS.has(key)) {
    return 'reverb';
  }
  if (key.startsWith('granular')) {
    if (
      CORE_PRODUCT_GRANULAR_OWNERSHIP_PREFIX_EXCLUSIONS.some(prefix => key.startsWith(prefix)) ||
      key === 'granularEnabled' ||
      key === 'granularFreeze' ||
      key === 'granularShape' ||
      key.endsWith('Enabled') ||
      key.endsWith('Mode') ||
      key.endsWith('Slice') ||
      key.endsWith('Reverse') ||
      key.includes('TempoSync')
    ) {
      return undefined;
    }
    return 'granular';
  }
  return undefined;
}

function coreProductSampleHoldTriggerFlag(bus: CoreProductSampleHoldTriggerBus | undefined): number {
  switch (bus) {
    case 'delayA':
      return CORE_PRODUCT_MODULATION_RANGE_FLAGS.triggerDelayA;
    case 'delayB':
      return CORE_PRODUCT_MODULATION_RANGE_FLAGS.triggerDelayB;
    case 'granular':
      return CORE_PRODUCT_MODULATION_RANGE_FLAGS.triggerGranular;
    case 'reverb':
      return CORE_PRODUCT_MODULATION_RANGE_FLAGS.triggerReverb;
    default:
      return 0;
  }
}

const GRANULAR_VOICE_RANGE_PARAM_SUFFIXES = [
  ['Speed', 'Speed'],
  ['ScanRate', 'ScanRate'],
  ['Pitch', 'Pitch'],
  ['WriteFollow', 'WriteFollow'],
  ['Density', 'Density'],
  ['GrainSize', 'GrainSizeMs'],
  ['Spray', 'Spray'],
  ['PositionSpray', 'PositionSpray'],
  ['TimingSpray', 'TimingSpray'],
  ['Lookback', 'Lookback'],
  ['WriteGuard', 'WriteGuard'],
  ['PitchSpread', 'PitchSpread'],
  ['PitchJitter', 'PitchJitterCents'],
  ['PitchQuantize', 'PitchQuantize'],
  ['ReverseChance', 'ReverseChance'],
  ['Bloom', 'Bloom'],
  ['Glide', 'Glide'],
  ['LoopCrossfade', 'LoopCrossfadeMs'],
  ['GrainOct', 'GrainOctaveProbability'],
  ['Attack', 'AttackSeconds'],
  ['Decay', 'DecaySeconds'],
  ['Gain', 'Gain'],
  ['Pan', 'Pan'],
  ['Blur', 'Blur'],
  ['StereoSpread', 'StereoSpread'],
  ['PosLFORate', 'PositionLfoRate'],
  ['PosLFODepth', 'PositionLfoDepth'],
  ['PanLFORate', 'PanLfoRate'],
  ['ReverseLFORate', 'ReverseLfoRate'],
  ['RecordLFORate', 'RecordLfoRate'],
] as const;

function granularVoiceRangeTargets(): Record<string, CoreProductRangeTargetResolver> {
  const targets: Record<string, CoreProductRangeTargetResolver> = {};
  for (const voiceNumber of [1, 2, 3, 4] as const) {
    for (const [stateSuffix, paramSuffix] of GRANULAR_VOICE_RANGE_PARAM_SUFFIXES) {
      const stateKey = `granularV${voiceNumber}${stateSuffix}`;
      const paramName = `FxGranularV${voiceNumber}${paramSuffix}` as ProductParamIdName;
      targets[stateKey] = (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS[paramName], key)];
    }
  }
  return targets;
}

function granularMacroVoiceTargets(
  key: string,
  paramSuffix: string,
  select: (model: GranularMacroModel, voiceIndex: number) => number,
): CoreProductRangeTarget[] {
  const targets: CoreProductRangeTarget[] = [];
  for (const voiceNumber of [1, 2, 3, 4] as const) {
    const paramName = `FxGranularV${voiceNumber}${paramSuffix}` as ProductParamIdName;
    targets.push(productParamTarget(
      KESSHO_PRODUCT_PARAM_IDS[paramName],
      key,
      granularMacroVoiceMap(key, select, voiceNumber - 1),
    ));
  }
  return targets;
}

function padExactRangeTargets(): Record<string, CoreProductRangeTargetResolver> {
  const targets: Record<string, CoreProductRangeTargetResolver> = {};
  for (const spec of KESSHO_PRODUCT_PAD_PARAM_SPECS) {
    const sourceEnvelopeParamId = spec.key === 'synthAttack'
      ? KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds
      : spec.key === 'synthDecay'
        ? KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds
        : spec.key === 'synthSustain'
          ? KESSHO_PRODUCT_PARAM_IDS.SourceSustain
          : spec.key === 'synthRelease'
            ? KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds
            : null;
    const pad1Map = (value: number, context: CoreProductRangeValueContext) => (
      mapPadExactValueForDistance(0, spec.key, value, context)
    );
    const pad2Map = (value: number, context: CoreProductRangeValueContext) => (
      mapPadExactValueForDistance(1, spec.pad2Key, value, context)
    );
    targets[spec.key] = (key) => [
      productParamTarget(coreProductPadRuntimeParamId(0, spec.index), key, pad1Map),
      ...(sourceEnvelopeParamId === null ? [] : [
        sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, sourceEnvelopeParamId, key, pad1Map),
      ]),
    ];
    targets[spec.pad2Key] = (key) => [
      productParamTarget(coreProductPadRuntimeParamId(1, spec.index), key, pad2Map),
      ...(sourceEnvelopeParamId === null ? [] : [
        sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, sourceEnvelopeParamId, key, pad2Map),
      ]),
    ];
  }
  return targets;
}

function padExactSampleHoldRangeTargets(): Record<string, CoreProductRangeTargetResolver> {
  const targets: Record<string, CoreProductRangeTargetResolver> = {};
  for (const spec of KESSHO_PRODUCT_PAD_PARAM_SPECS) {
    const sourceEnvelopeParamId = spec.key === 'synthAttack'
      ? KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds
      : spec.key === 'synthDecay'
        ? KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds
        : spec.key === 'synthSustain'
          ? KESSHO_PRODUCT_PARAM_IDS.SourceSustain
          : spec.key === 'synthRelease'
            ? KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds
            : null;
    targets[spec.key] = (key) => [
      sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, coreProductPadRuntimeParamId(0, spec.index), key, (value, context) => (
        mapPadExactValueForDistance(0, key, value, context)
      )),
      ...(sourceEnvelopeParamId === null ? [] : [
        sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, sourceEnvelopeParamId, key, (value, context) => (
          mapPadExactValueForDistance(0, key, value, context)
        )),
      ]),
    ];
    targets[spec.pad2Key] = (key) => [
      sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, coreProductPadRuntimeParamId(1, spec.index), key, (value, context) => (
        mapPadExactValueForDistance(1, key, value, context)
      )),
      ...(sourceEnvelopeParamId === null ? [] : [
        sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, sourceEnvelopeParamId, key, (value, context) => (
          mapPadExactValueForDistance(1, key, value, context)
        )),
      ]),
    ];
  }
  return targets;
}

const SAMPLE_HOLD_RANGE_KEY_TARGETS: Record<string, CoreProductRangeTargetResolver> = {
  ...padExactSampleHoldRangeTargets(),
};

const RANGE_KEY_TARGETS: Record<string, CoreProductRangeTargetResolver> = {
  ...padExactRangeTargets(),
  ...granularVoiceRangeTargets(),
  ...soundscapeModuleRangeTargets(),
  synthLevel: (key) => [
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key),
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key),
  ],
  pad2Level: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  leadLevel: (key) => [
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key),
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key),
  ],
  lead1Level: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  lead2Level: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  drumLevel: (key) => [
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key),
    productParamTarget(coreProductDrumRuntimeParamId(CORE_PRODUCT_DRUM_MASTER_LEVEL_PARAM_INDEX), key),
  ],
  sample1Level: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  sample2Level: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  nature1Level: (key) => [soundscapeTextureLevelTarget(0, key, soundscapeNatureTextureLevelMap)],
  nature2Level: (key) => [soundscapeTextureLevelTarget(1, key, soundscapeNatureTextureLevelMap)],
  nature3Level: (key) => [soundscapeTextureLevelTarget(2, key, soundscapeNatureTextureLevelMap)],
  nature4Level: (key) => [soundscapeTextureLevelTarget(3, key, soundscapeNatureTextureLevelMap)],
  nature1SliceDuration: (key) => [soundscapeTextureParamTarget(0, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.sliceDuration, key)],
  nature2SliceDuration: (key) => [soundscapeTextureParamTarget(1, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.sliceDuration, key)],
  nature3SliceDuration: (key) => [soundscapeTextureParamTarget(2, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.sliceDuration, key)],
  nature4SliceDuration: (key) => [soundscapeTextureParamTarget(3, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.sliceDuration, key)],
  nature1SliceDensity: (key) => [soundscapeTextureParamTarget(0, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.density, key)],
  nature2SliceDensity: (key) => [soundscapeTextureParamTarget(1, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.density, key)],
  nature3SliceDensity: (key) => [soundscapeTextureParamTarget(2, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.density, key)],
  nature4SliceDensity: (key) => [soundscapeTextureParamTarget(3, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.density, key)],
  nature1FilterCutoff: (key) => [soundscapeTextureParamTarget(0, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterCutoff, key)],
  nature2FilterCutoff: (key) => [soundscapeTextureParamTarget(1, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterCutoff, key)],
  nature3FilterCutoff: (key) => [soundscapeTextureParamTarget(2, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterCutoff, key)],
  nature4FilterCutoff: (key) => [soundscapeTextureParamTarget(3, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterCutoff, key)],
  nature1FilterResonance: (key) => [soundscapeTextureParamTarget(0, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterResonance, key)],
  nature2FilterResonance: (key) => [soundscapeTextureParamTarget(1, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterResonance, key)],
  nature3FilterResonance: (key) => [soundscapeTextureParamTarget(2, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterResonance, key)],
  nature4FilterResonance: (key) => [soundscapeTextureParamTarget(3, CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_INDEX.filterResonance, key)],
  natureLevel: (key) => [
    soundscapeTextureLevelTarget(0, key, soundscapeNatureMasterTextureLevelMap('nature1Level')),
    soundscapeTextureLevelTarget(1, key, soundscapeNatureMasterTextureLevelMap('nature2Level')),
    soundscapeTextureLevelTarget(2, key, soundscapeNatureMasterTextureLevelMap('nature3Level')),
    soundscapeTextureLevelTarget(3, key, soundscapeNatureMasterTextureLevelMap('nature4Level')),
    soundscapeAssetLevelTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds.assetId, key, soundscapeNatureMasterAssetLevelMap('birdsLevel')),
    soundscapeAssetLevelTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds2.assetId, key, soundscapeNatureMasterAssetLevelMap('birds2Level')),
    soundscapeAssetLevelTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.frogs.assetId, key, soundscapeNatureMasterAssetLevelMap('frogsLevel')),
  ],
  birdsLevel: (key) => [soundscapeAssetLevelTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds.assetId, key, soundscapeNatureAssetLevelMap)],
  birds2Level: (key) => [soundscapeAssetLevelTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds2.assetId, key, soundscapeNatureAssetLevelMap)],
  frogsLevel: (key) => [soundscapeAssetLevelTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.frogs.assetId, key, soundscapeNatureAssetLevelMap)],
  oceanSampleLevel: (key) => [soundscapeAssetLevelTarget(CORE_PRODUCT_SOUNDSCAPE_ASSETS.ocean.assetId, key)],
  padMorph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  pad2Morph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  lead1Morph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  lead2Morph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  waterMorph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  padDistance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  pad2Distance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  lead1Distance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  lead2Distance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  sample1Distance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  sample2Distance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  padExpression: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)],
  pad2Expression: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)],
  lead1Expression: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)],
  lead2Expression: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)],
  leadVibratoDepth: (key) => [
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth, key),
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth, key),
  ],
  leadVibratoRate: (key) => [
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate, key),
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate, key),
  ],
  leadGlide: (key) => [
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide, key),
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide, key),
  ],
  lead1VibratoDepth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth, key)],
  lead1VibratoRate: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate, key)],
  lead1Glide: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide, key)],
  lead2VibratoDepth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth, key)],
  lead2VibratoRate: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate, key)],
  lead2Glide: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide, key)],
  padPostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  pad2PostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  lead1PostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  lead2PostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  sample1PostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  sample2PostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  padStereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  pad2StereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  lead1StereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  lead2StereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  sample1StereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  sample2StereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  lead1PostLPFKeyTracking: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfKeyTracking, key)],
  lead2PostLPFKeyTracking: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfKeyTracking, key)],
  lead1Attack: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds, key)],
  lead2Attack: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds, key)],
  lead1Decay: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds, key)],
  lead2Decay: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds, key)],
  lead1Sustain: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceSustain, key)],
  lead2Sustain: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceSustain, key)],
  lead1Hold: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, key)],
  lead2Hold: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, key)],
  lead1Release: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds, key)],
  lead2Release: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds, key)],
  synthHold: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, key)],
  pad2Hold: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, key)],
  sample1AttackMs: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds, key, (value) => value / 1000)],
  sample2AttackMs: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceAttackSeconds, key, (value) => value / 1000)],
  sample1DecayMs: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds, key, (value) => value / 1000)],
  sample2DecayMs: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceDecaySeconds, key, (value) => value / 1000)],
  sample1Sustain: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceSustain, key)],
  sample2Sustain: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceSustain, key)],
  sample1HoldMs: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, key, (value) => value / 1000)],
  sample2HoldMs: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceHoldSeconds, key, (value) => value / 1000)],
  sample1ReleaseMs: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds, key, (value) => value / 1000)],
  sample2ReleaseMs: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceReleaseSeconds, key, (value) => value / 1000)],
  pad1ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  pad2ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  lead1ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  lead2ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  drumReverbSend: (key) => [
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key),
    productParamTarget(coreProductDrumRuntimeParamId(CORE_PRODUCT_DRUM_REVERB_SEND_PARAM_INDEX), key),
  ],
  sample1ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  sample2ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  natureReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  oceanReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  waterReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  insectsReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  pad1DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  pad2DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  lead1DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  lead2DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  drumDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  sample1DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  sample2DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  natureDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  oceanDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  waterDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  insDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  pad1DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  pad2DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  lead1DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  lead2DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  drumDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  sample1DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  sample2DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  natureDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  oceanDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  waterDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  insDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  granularPad1Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularPad2Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularLead1Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularLead2Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularDrumSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularSample1Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularSample2Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularNatureSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularWavesSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularWaterSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularInsectsSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  degradePad1Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradePad2Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradeLead1Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradeLead2Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradeDrumSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradeSample1Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradeSample2Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradeNatureSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradeWavesSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradeWaterSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  degradeInsectsSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDegradeSend, key)],
  padDiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  pad2DiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  lead1DiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  lead2DiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  sample1DiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample1, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  sample2DiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.sample2, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  masterVolume: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.MasterGain, key)],
  masterLimiterCeilingDb: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.MasterLimiterCeilingDb, key)],
  granularLevel: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularMix, key, granularLevelMap(key))],
  granularFeedback: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularFeedback, key)],
  granularFeedbackLPF: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularFeedbackLpfHz, key)],
  granularBufferSeconds: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularBufferSeconds, key)],
  granularMaxGrains: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularMaxGrains, key, (value) => clamp(Math.round(value), 8, 64)),
  ],
  granularSprayMacro: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularSprayMacro, key),
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularTimingRandomness, key, granularMacroMap(key, (model) => model.timingRandomness)),
    ...granularMacroVoiceTargets(key, 'PositionSpray', (model, voiceIndex) => model.voicePositionSpray[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'TimingSpray', (model, voiceIndex) => model.voiceTimingSpray[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'PitchJitterCents', (model, voiceIndex) => model.voicePitchJitter[voiceIndex] ?? 0),
  ],
  granularCloudMacro: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularCloudMacro, key),
    ...granularMacroVoiceTargets(key, 'Density', (model, voiceIndex) => model.voiceDensity[voiceIndex] ?? 1),
    ...granularMacroVoiceTargets(key, 'GrainSizeMs', (model, voiceIndex) => model.voiceGrainSize[voiceIndex] ?? 10),
    ...granularMacroVoiceTargets(key, 'Blur', (model, voiceIndex) => model.voiceBlur[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'Bloom', (model, voiceIndex) => model.voiceBloom[voiceIndex] ?? 0),
  ],
  granularPitchMacro: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularPitchMacro, key),
    ...granularMacroVoiceTargets(key, 'PitchJitterCents', (model, voiceIndex) => model.voicePitchJitter[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'GrainOctaveProbability', (model, voiceIndex) => model.voiceGrainOct[voiceIndex] ?? 0),
  ],
  granularDiffusion: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularBusDiffusion, key, granularMacroMap(key, (model) => model.busDiffusion)),
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularTimingRandomness, key, granularMacroMap(key, (model) => model.timingRandomness)),
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularReverbLpfHz, key, granularMacroMap(key, (model) => model.finalReverbLPF)),
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularOutputLpfHz, key, granularMacroMap(key, (model) => model.finalOutputLPF)),
    ...granularMacroVoiceTargets(key, 'AttackSeconds', (model, voiceIndex) => model.voiceAttack[voiceIndex] ?? 0.01),
    ...granularMacroVoiceTargets(key, 'DecaySeconds', (model, voiceIndex) => model.voiceDecay[voiceIndex] ?? 0.1),
    ...granularMacroVoiceTargets(key, 'Blur', (model, voiceIndex) => model.voiceBlur[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'PositionSpray', (model, voiceIndex) => model.voicePositionSpray[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'TimingSpray', (model, voiceIndex) => model.voiceTimingSpray[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'Density', (model, voiceIndex) => model.voiceDensity[voiceIndex] ?? 1),
    ...granularMacroVoiceTargets(key, 'GrainSizeMs', (model, voiceIndex) => model.voiceGrainSize[voiceIndex] ?? 10),
  ],
  granularReverbLPF: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularReverbLpfHz, key, granularMacroMap(key, (model) => model.finalReverbLPF)),
  ],
  granularOutputLPF: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularOutputLpfHz, key, granularMacroMap(key, (model) => model.finalOutputLPF)),
  ],
  granularChordBias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularChordBias, key)],
  granularLegacyJitter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyJitterMs, key)],
  granularLegacyProbability: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyProbability, key)],
  granularLegacyPitchSpread: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyPitchSpread, key)],
  granularLegacyMaxGrains: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyMaxGrains, key, (value) => clamp(Math.round(value), 0, 64)),
  ],
  granularLegacyFeedback: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularLegacyFeedback, key)],
  granularMacroActivity: (key) => [
    ...granularMacroVoiceTargets(key, 'Density', (model, voiceIndex) => model.voiceDensity[voiceIndex] ?? 1),
    ...granularMacroVoiceTargets(key, 'GrainSizeMs', (model, voiceIndex) => model.voiceGrainSize[voiceIndex] ?? 10),
    ...granularMacroVoiceTargets(key, 'DecaySeconds', (model, voiceIndex) => model.voiceDecay[voiceIndex] ?? 0.1),
    ...granularMacroVoiceTargets(key, 'Blur', (model, voiceIndex) => model.voiceBlur[voiceIndex] ?? 0),
  ],
  granularMacroTexture: (key) => [
    ...granularMacroVoiceTargets(key, 'Blur', (model, voiceIndex) => model.voiceBlur[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'GrainSizeMs', (model, voiceIndex) => model.voiceGrainSize[voiceIndex] ?? 10),
    ...granularMacroVoiceTargets(key, 'GrainOctaveProbability', (model, voiceIndex) => model.voiceGrainOct[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'DecaySeconds', (model, voiceIndex) => model.voiceDecay[voiceIndex] ?? 0.1),
  ],
  granularMacroComplexity: (key) => [
    ...granularMacroVoiceTargets(key, 'PositionLfoRate', (model, voiceIndex) => model.voicePosLFORate[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'PositionLfoDepth', (model, voiceIndex) => model.voicePosLFODepth[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'PanLfoRate', (model, voiceIndex) => model.voicePanLFORate[voiceIndex] ?? 0),
  ],
  granularMacroDarkness: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularReverbLpfHz, key, granularMacroMap(key, (model) => model.finalReverbLPF)),
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularOutputLpfHz, key, granularMacroMap(key, (model) => model.finalOutputLPF)),
  ],
  lead1Density: (key) => [
    controlOnlyRangeTarget(KESSHO_PRODUCT_PARAM_IDS.SequencerLaneProbability, key),
  ],
  lead1Octave: (key) => [
    controlOnlyRangeTarget(KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, key),
  ],
  lead1OctaveRange: (key) => [
    controlOnlyRangeTarget(KESSHO_PRODUCT_PARAM_IDS.SequencerLaneHoldSeconds, key),
  ],
  chordRate: (key) => [
    controlOnlyRangeTarget(KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision, key),
  ],
  voicingSpread: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.HarmonyVoicingSpread, key),
  ],
  waveSpread: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.ArrangementWaveSpread, key),
  ],
  detune: (key) => [
    controlOnlyRangeTarget(KESSHO_PRODUCT_PARAM_IDS.SequencerLaneVelocity, key),
  ],
  synthOctave: (key) => [
    controlOnlyRangeTarget(KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, key),
  ],
  granularMacroChaos: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxGranularTimingRandomness, key, granularMacroMap(key, (model) => model.timingRandomness)),
    ...granularMacroVoiceTargets(key, 'GrainOctaveProbability', (model, voiceIndex) => model.voiceGrainOct[voiceIndex] ?? 0),
    ...granularMacroVoiceTargets(key, 'ReverseLfoRate', (model, voiceIndex) => model.voiceReverseLFORate[voiceIndex] ?? 0),
  ],
  delayAEnabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAEnabled, key, binaryParamValue)],
  delayAMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAMix, key)],
  drumDelayNoteL: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeLeftMs, key, indexedDelayDivisionMs('drumDelayNoteL', 10)),
  ],
  drumDelayNoteR: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeRightMs, key, indexedDelayDivisionMs('drumDelayNoteR', 10)),
  ],
  drumDelayFeedback: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAFeedback, key)],
  drumDelayMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAMix, key)],
  drumDelayFilter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAFilterHz, key, normalizedToDrumDelayFilterHz)],
  delayAFeedback: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAFeedback, key)],
  delayAFilter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAFilterHz, key)],
  delayAModRate: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAModRateHz, key, normalizedToDelayAModRateHz)],
  delayAModDepth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAModDepthMs, key, normalizedToDelayAModDepthMs)],
  delayADuck: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayADuck, key)],
  delayAWidth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAWidth, key)],
  delayACrossFeedFilter: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayACrossFeedFilterHz, key, normalizedToDelayACrossFeedFilterHz),
  ],
  delayBMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBMix, key)],
  granularDelayEnabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBEnabled, key, binaryParamValue)],
  granularDelayMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBMix, key)],
  granularDelayTime: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBBaseTimeMs, key, indexedDelayDivisionMs('granularDelayTime', 20)),
  ],
  granularDelayActivity: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBActivity, key)],
  granularDelayRepeats: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBRepeats, key)],
  granularDelayFilter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTone, key)],
  granularDelayVibrato: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBVibrato, key)],
  delayBWarpIntensity: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBWarpIntensity, key)],
  delayBSpread: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBSpread, key)],
  delayBTapeHead1Enabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHeadMask, key, delayBTapeHeadMaskMap(0))],
  delayBTapeHead2Enabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHeadMask, key, delayBTapeHeadMaskMap(1))],
  delayBTapeHead3Enabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHeadMask, key, delayBTapeHeadMaskMap(2))],
  delayBTapeHead4Enabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHeadMask, key, delayBTapeHeadMaskMap(3))],
  delayBTapeHead1Level: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHead1Level, key)],
  delayBTapeHead2Level: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHead2Level, key)],
  delayBTapeHead3Level: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHead3Level, key)],
  delayBTapeHead4Level: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHead4Level, key)],
  delayBTapeHead1Pan: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHead1Pan, key)],
  delayBTapeHead2Pan: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHead2Pan, key)],
  delayBTapeHead3Pan: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHead3Pan, key)],
  delayBTapeHead4Pan: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTapeHead4Pan, key)],
  delayAToBSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayAToDelayB, key)],
  delayBToASend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToDelayA, key)],
  delayAReverbSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayToReverb, key)],
  delayAGranularSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayAToGranular, key)],
  delayBGranularSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToGranular, key)],
  granularDelayASend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToDelayA, key)],
  granularDelayBSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToDelayB, key)],
  granularReverbSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToReverb, key, granularSendTrim)],
  granularDelayReverbSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToReverb, key)],
  delayADegradeSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayAToDegrade, key)],
  delayBDegradeSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToDegrade, key)],
  granularDegradeSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToDegrade, key)],
  reverbDegradeSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingReverbToDegrade, key)],
  degradeReverbSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDegradeToReverb, key)],
  degradeLevel: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDegradeReturnLevel, key)],
  dynamicsPad1Bus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsPad1Bus, key, dynamicsBusParamValue)],
  dynamicsPad2Bus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsPad2Bus, key, dynamicsBusParamValue)],
  dynamicsLead1Bus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsLead1Bus, key, dynamicsBusParamValue)],
  dynamicsLead2Bus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsLead2Bus, key, dynamicsBusParamValue)],
  dynamicsPianoBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsPianoBus, key, dynamicsBusParamValue)],
  dynamicsDrumBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsDrumBus, key, dynamicsBusParamValue)],
  dynamicsGranularBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsGranularBus, key, dynamicsBusParamValue)],
  dynamicsWavesBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsWavesBus, key, dynamicsBusParamValue)],
  dynamicsWaterBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsWaterBus, key, dynamicsBusParamValue)],
  dynamicsInsectsBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsInsectsBus, key, dynamicsBusParamValue)],
  dynamicsNatureBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsNatureBus, key, dynamicsBusParamValue)],
  dynamicsDelayABus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsDelayABus, key, dynamicsBusParamValue)],
  dynamicsDelayBBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsDelayBBus, key, dynamicsBusParamValue)],
  dynamicsDegradeBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsDegradeBus, key, dynamicsBusParamValue)],
  dynamicsReverbBus: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDynamicsReverbBus, key, dynamicsBusParamValue)],
  reverbLevel: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbMix, key)],
  reverbDecay: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDecay, key)],
  reverbSize: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbSize, key)],
  damping: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDamping, key)],
  reverbDiffusion: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDiffusion, key)],
  reverbModulation: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbModulation, key)],
  predelay: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPredelayMs, key)],
  width: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbWidth, key)],
  reverbShimmer: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerAmount, key)],
  reverbShimmerPitch: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerPitch, key)],
  reverbSlowModRate: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbSlowRateHz, key)],
  reverbSlowModDepth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbSlowDepth, key)],
  reverbReverse: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbReverseAmount, key)],
  reverbReverseLength: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbReverseLengthSec, key)],
  reverbChorusRate: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbChorusRateHz, key)],
  reverbChorusDepth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbChorusDepth, key)],
  reverbDampLow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDampLow, key)],
  reverbDampHigh: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDampHigh, key)],
  reverbCrossoverFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbCrossoverHz, key)],
  reverbInputTone: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbInputTone, key)],
  reverbShimmerFeedback: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerFeedback, key)],
  reverbBloom: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbBloom, key)],
  reverbWarp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbWarp, key)],
  reverbCrossFeed: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbCrossFeed, key)],
  reverbEarlyReflections: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbEarlyReflections, key)],
  reverbAirAbsorption: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbAirAbsorption, key)],
  reverbTransientSmooth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbTransientSmooth, key)],
  reverbErLpFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbErLpFreq, key)],
  reverbPreCompThreshold: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompThreshold, key)],
  reverbPreCompKnee: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompKnee, key)],
  reverbPreCompRatio: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompRatio, key)],
  reverbPreCompAttackMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompAttackMs, key)],
  reverbPreCompReleaseMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompReleaseMs, key)],
  reverbPreCompMakeup: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompMakeup, key)],
  reverbChordWash: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbChordWash, key)],
  reverbResolutionBloom: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbResolutionBloom, key)],
  spectralFreezeMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeMix, key)],
  spectralFreezeEnabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeEnabled, key, binaryParamValue)],
  spectralFreezeActive: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeActive, key, binaryParamValue)],
  spectralFreezeMode: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeMode, key, spectralFreezeModeValue)],
  spectralFreezeCaptureSerial: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeCaptureSerial, key)],
  spectralFreezeStretchSpeed: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeStretchSpeed, key)],
  spectralFreezeDirection: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeDirection, key, spectralFreezeDirectionValue)],
  spectralFreezePosition: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezePosition, key)],
  spectralFreezeRefresh: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeRefresh, key)],
  spectralFreezeInputSensitivity: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeInputSensitivity, key)],
  spectralFreezeDiffusion: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeDiffusion, key)],
  spectralFreezeTone: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeTone, key)],
  spectralFreezeWidth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeWidth, key)],
  spectralFreezeSustain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeSustain, key)],
  spectralFreezeRouting: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeRouting, key, spectralFreezeRoutingValue)],
  spectralFreezeReverbCrossfade: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeReverbCrossfade, key)],
  dynamicsDrive: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDrive, key)],
  dynamicsEnabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEnabled, key, binaryParamValue)],
  driftEnabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftEnabled, key, binaryParamValue)],
  driftMode: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftMode, key, stateBackedEnumParamValue(key, dynamicsDriftModeId, 2))],
  driftQuality: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftQuality, key, stateBackedEnumParamValue(key, dynamicsDriftQualityId, 2))],
  driftAntiComb: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftAntiComb, key)],
  driftDiffusion: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftDiffusion, key)],
  driftMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftMix, key)],
  driftAge: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftAge, key)],
  driftBias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftBias, key)],
  driftLpgAmount: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftLpgAmount, key)],
  driftDepth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftDepth, key)],
  driftRate: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftRate, key)],
  driftDamp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftDamp, key)],
  driftEnvFollow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftEnvFollow, key)],
  driftStereo: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftStereo, key)],
  driftResonance: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftResonance, key)],
  erosionEnabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionEnabled, key, binaryParamValue)],
  erosionQuality: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionQuality, key, stateBackedEnumParamValue(key, dynamicsErosionQualityId, 2))],
  erosionEventAmount: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionEventAmount, key)],
  erosionProfileAmount: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionProfileAmount, key)],
  erosionDitherAmount: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionDitherAmount, key)],
  erosionMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionMix, key)],
  erosionAge: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionAge, key)],
  erosionGeneration: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionGeneration, key)],
  erosionAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionAlias, key)],
  erosionWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionWow, key)],
  erosionFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionFlutter, key)],
  erosionDrift: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionDrift, key)],
  erosionWobbleSpeed: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionWobbleSpeed, key)],
  erosionNoise: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionNoise, key)],
  degradeHp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeHp, key)],
  degradeLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeLp, key)],
  erosionTone: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionTone, key)],
  erosionSaturation: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionSaturation, key)],
  erosionCorrosion: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsErosionCorrosion, key)],
  erosionModSlowWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowWow, key)],
  erosionModSlowFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowFlutter, key)],
  erosionModSlowLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowLp, key)],
  erosionModSlowWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowWet, key)],
  erosionModSlowDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowDropout, key)],
  erosionModSlowAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowAlias, key)],
  erosionModFlutterWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterWow, key)],
  erosionModFlutterFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterFlutter, key)],
  erosionModFlutterLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterLp, key)],
  erosionModFlutterWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterWet, key)],
  erosionModFlutterDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterDropout, key)],
  erosionModFlutterAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterAlias, key)],
  erosionModRandomWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomWow, key)],
  erosionModRandomFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomFlutter, key)],
  erosionModRandomLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomLp, key)],
  erosionModRandomWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomWet, key)],
  erosionModRandomDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomDropout, key)],
  erosionModRandomAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomAlias, key)],
  erosionModEnvWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvWow, key)],
  erosionModEnvFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvFlutter, key)],
  erosionModEnvLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvLp, key)],
  erosionModEnvWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvWet, key)],
  erosionModEnvDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvDropout, key)],
  erosionModEnvAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvAlias, key)],
  erosionModNoiseWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseWow, key)],
  erosionModNoiseFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseFlutter, key)],
  erosionModNoiseLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseLp, key)],
  erosionModNoiseWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseWet, key)],
  erosionModNoiseDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseDropout, key)],
  erosionModNoiseAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseAlias, key)],
  dynamicsSaturationEnabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationEnabled, key, binaryParamValue)],
  dynamicsSaturationMode: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationMode, key, stateBackedEnumParamValue(key, dynamicsSaturationModeId, 4))],
  dynamicsSaturationQuality: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationQuality, key, stateBackedEnumParamValue(key, dynamicsSaturationQualityId, 2))],
  dynamicsSaturationDrive: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationDrive, key)],
  dynamicsSaturationTone: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationTone, key)],
  dynamicsSaturationBias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationBias, key)],
  endCompEnabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompEnabled, key, binaryParamValue)],
  endCompMode: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMode, key, stateBackedEnumParamValue(key, dynamicsEndCompModeId, 4))],
  endCompPeakBlend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompPeakBlend, key)],
  endCompClarity: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompClarity, key)],
  endCompTwoBandAmount: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompTwoBandAmount, key)],
  endCompBandSplit: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompBandSplit, key)],
  dynamicsEq1Enabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1Enabled, key, binaryParamValue)],
  dynamicsEq1InputGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1InputGain, key)],
  dynamicsEq1OutputGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1OutputGain, key)],
  dynamicsEq1LowType: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1LowType, key, dynamicsEqEdgeTypeValue)],
  dynamicsEq1LowFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1LowFreq, key)],
  dynamicsEq1LowGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1LowGain, key)],
  dynamicsEq1LowQ: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1LowQ, key)],
  dynamicsEq1LowSlope: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1LowSlope, key)],
  dynamicsEq1MidFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1MidFreq, key)],
  dynamicsEq1MidGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1MidGain, key)],
  dynamicsEq1MidQ: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1MidQ, key)],
  dynamicsEq1HighType: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1HighType, key, dynamicsEqEdgeTypeValue)],
  dynamicsEq1HighFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1HighFreq, key)],
  dynamicsEq1HighGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1HighGain, key)],
  dynamicsEq1HighQ: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1HighQ, key)],
  dynamicsEq1HighSlope: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1HighSlope, key)],
  dynamicsEq2Enabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2Enabled, key, binaryParamValue)],
  dynamicsEq2InputGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2InputGain, key)],
  dynamicsEq2OutputGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2OutputGain, key)],
  dynamicsEq2LowType: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2LowType, key, dynamicsEqEdgeTypeValue)],
  dynamicsEq2LowFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2LowFreq, key)],
  dynamicsEq2LowGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2LowGain, key)],
  dynamicsEq2LowQ: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2LowQ, key)],
  dynamicsEq2LowSlope: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2LowSlope, key)],
  dynamicsEq2MidFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2MidFreq, key)],
  dynamicsEq2MidGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2MidGain, key)],
  dynamicsEq2MidQ: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2MidQ, key)],
  dynamicsEq2HighType: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2HighType, key, dynamicsEqEdgeTypeValue)],
  dynamicsEq2HighFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2HighFreq, key)],
  dynamicsEq2HighGain: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2HighGain, key)],
  dynamicsEq2HighQ: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2HighQ, key)],
  dynamicsEq2HighSlope: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2HighSlope, key)],
  endCompThreshold: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompThreshold, key)],
  endCompKnee: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompKnee, key)],
  endCompRatio: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompRatio, key)],
  endCompAttackMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompAttackMs, key)],
  endCompReleaseMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompReleaseMs, key)],
  endCompMakeup: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMakeup, key)],
  endCompMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMix, key)],
  endCompDetectorHp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompDetectorHp, key)],
  endCompDetectorTilt: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompDetectorTilt, key)],
  endCompAutoMakeup: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompAutoMakeup, key)],
  endCompProgramRelease: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompProgramRelease, key)],
  sidechainEnabled: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainEnabled, key, binaryParamValue)],
  sidechainKeyA: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyA, key, stateBackedEnumParamValue(key, sidechainKeyId, 7))],
  sidechainKeyB: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyB, key, stateBackedEnumParamValue(key, sidechainKeyId, 7))],
  sidechainKeyAWeight: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyAWeight, key)],
  sidechainKeyBWeight: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyBWeight, key)],
  sidechainAmount: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainAmount, key)],
  sidechainThreshold: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainThreshold, key)],
  sidechainRatio: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainRatio, key)],
  sidechainKnee: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainKnee, key)],
  sidechainAttackMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainAttackMs, key)],
  sidechainHoldMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainHoldMs, key)],
  sidechainReleaseMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainReleaseMs, key)],
  sidechainMakeup: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainMakeup, key)],
  sidechainMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainMix, key)],
  sidechainCurve: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainCurve, key)],
  sidechainDetectorHp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainDetectorHp, key)],
  sidechainDetectorLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainDetectorLp, key)],
  sidechainPad1Target: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainPad1Target, key)],
  sidechainPad2Target: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainPad2Target, key)],
  sidechainLead1Target: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainLead1Target, key)],
  sidechainLead2Target: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainLead2Target, key)],
  sidechainPianoTarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainPianoTarget, key)],
  sidechainGranularTarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainGranularTarget, key)],
  sidechainDelayATarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainDelayATarget, key)],
  sidechainDelayBTarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainDelayBTarget, key)],
  sidechainReverbTarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainReverbTarget, key)],
};

const DRUM_RUNTIME_RANGE_VOICES: Array<[RegExp, number]> = [
  [/^drumSub/, 0],
  [/^drumKick/, 1],
  [/^drumClick/, 2],
  [/^drumBeepHi/, 3],
  [/^drumBeepLo/, 4],
  [/^drumNoise/, 5],
  [/^drumMembrane/, 6],
];

function resolveCoreProductDrumRuntimeRangeTargets(key: string): CoreProductRangeTarget[] {
  const voiceIndex = DRUM_RUNTIME_RANGE_VOICES.find(([pattern]) => pattern.test(key))?.[1];
  if (voiceIndex === undefined) return [];
  if (/Morph$/.test(key)) {
    return [drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)];
  }
  if (/Expression/i.test(key)) {
    return [drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)];
  }
  if (/DelaySend/i.test(key)) {
    return [drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)];
  }
  if (/Distance/i.test(key)) {
    return [drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)];
  }
  const exactTargets = KESSHO_PRODUCT_DRUM_PARAM_SPECS
    .filter((spec) => spec.key === key)
    .map((spec) => drumExactTarget(voiceIndex, spec.index, key));
  if (exactTargets.length > 0) {
    return exactTargets;
  }
  return [];
}

export function resolveCoreProductRangeTargets(key: string, mode?: CoreProductModulationRangeMode): CoreProductRangeTarget[] {
  if (mode === CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold) {
    const sampleHoldTargets = SAMPLE_HOLD_RANGE_KEY_TARGETS[key]?.(key);
    if (sampleHoldTargets) return sampleHoldTargets;
  }
  return RANGE_KEY_TARGETS[key]?.(key) ?? resolveCoreProductDrumRuntimeRangeTargets(key);
}

export function isCoreProductRangeKeySupported(key: string): boolean {
  return resolveCoreProductRangeTargets(key).length > 0;
}

export function resolveCoreProductDrumMorphRangeTarget(voiceIndex: number, key: string): CoreProductRangeTarget {
  return drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key);
}

export function resolveCoreProductDrumParamRangeTarget(
  voiceIndex: number,
  paramName: 'distance' | 'expression' | 'delayA',
  key: string,
): CoreProductRangeTarget {
  return drumTarget(
    voiceIndex,
    paramName === 'expression'
      ? KESSHO_PRODUCT_PARAM_IDS.SourceExpression
      : paramName === 'delayA'
      ? KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend
      : KESSHO_PRODUCT_PARAM_IDS.SourceDistance,
    key,
  );
}

export function createCoreProductStartEvent(): CoreProductEvent {
  return { eventKind: KESSHO_PRODUCT_EVENT_IDS.Start };
}

export function createCoreProductStopEvent(): CoreProductEvent {
  return { eventKind: KESSHO_PRODUCT_EVENT_IDS.Stop };
}

export function createCoreProductManualNoteEvent(
  sourceId: number,
  midi: number,
  velocity: number,
  durationMs: number,
  padVoiceIndex?: number,
  options: { transientAudition?: boolean } = {},
): CoreProductEvent {
  const flags = coreProductPadVoiceEventFlags(padVoiceIndex) |
    (options.transientAudition ? CORE_PRODUCT_TRANSIENT_MANUAL_NOTE_AUDITION_FLAG : 0);
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn,
    targetId: requireSourceId(sourceId),
    value: requireNumberInRange(midi, 'midi', 0, 127),
    value2: requirePositiveUnitValue(velocity, 'velocity'),
    value3: requirePositiveFinite(durationMs, 'durationMs') / 1000,
    ...(flags ? { flags } : {}),
  };
}

export function createCoreProductManualNoteOffEvent(
  sourceId: number,
  options: { hard?: boolean } = {},
): CoreProductEvent {
  const event: CoreProductEvent = {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.ManualNoteOff,
    targetId: requireManualNoteOffSourceId(sourceId),
  };
  if (options.hard) event.value = 1;
  return event;
}

export function createCoreProductManualNoteKillEvent(sourceId: number): CoreProductEvent {
  return createCoreProductManualNoteOffEvent(sourceId, { hard: true });
}

export function createCoreProductDrumTriggerEvent(voiceIndex: number, velocity: number): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.TriggerDrumVoice,
    targetId: requireDrumVoiceIndex(voiceIndex),
    value: requirePositiveUnitValue(velocity, 'velocity'),
  };
}

export function createCoreProductSourcePresetEvent(sourceId: number, presetId: number): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSourcePreset,
    targetId: requireSourceId(sourceId),
    value: requireIntegerInRange(presetId, 'presetId', 1, Number.MAX_SAFE_INTEGER),
  };
}

export function createCoreProductSourcePresetEndpointEvent(sourceId: number, endpoint: 'A' | 'B', presetId: number, voiceIndex = 0, morph?: number): CoreProductEvent {
  const targetId = requireSourceId(sourceId);
  const endpointOffset = endpoint === 'B' ? 1 : 0;
  const index = targetId === CORE_PRODUCT_SOURCE_IDS.drum
    ? 1 + requireDrumVoiceIndex(voiceIndex) + endpointOffset * KESSHO_PRODUCT_DRUM_VOICE_COUNT
    : 1 + endpointOffset;
  const drumMorph = targetId === CORE_PRODUCT_SOURCE_IDS.drum && typeof morph === 'number' && Number.isFinite(morph)
    ? requireUnitValue(morph, 'morph')
    : undefined;
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSourcePreset,
    targetId,
    index,
    value: requireIntegerInRange(presetId, 'presetId', 1, Number.MAX_SAFE_INTEGER),
    ...(drumMorph !== undefined ? { value2: drumMorph, flags: CORE_PRODUCT_SOURCE_PRESET_ENDPOINT_HAS_MORPH_FLAG } : {}),
  };
}

export function createCoreProductSourceOverrideSlotEvent(
  sourceId: number,
  slotIndex: number,
  paramIndex: number,
  value: number,
): CoreProductEvent {
  const targetId = requireSourceId(sourceId);
  const paramCount = coreProductSourceOverrideParamCount(targetId);
  if (paramCount <= 0) {
    throw productBridgeError(`sourceId does not support sparse overrides: ${String(sourceId)}`);
  }
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSourceOverride,
    targetId,
    index: requireIntegerInRange(slotIndex, 'slotIndex', 0, paramCount - 1),
    paramId: requireIntegerInRange(paramIndex, 'paramIndex', 0, paramCount - 1),
    value: requireFiniteNumber(value, 'value'),
    flags: CORE_PRODUCT_SOURCE_OVERRIDE_FLAGS.setSlot,
  };
}

export function createCoreProductSourceOverrideCommitEvent(sourceId: number, overrideCount: number, morphAnchor?: number): CoreProductEvent {
  const targetId = requireSourceId(sourceId);
  const paramCount = coreProductSourceOverrideParamCount(targetId);
  if (paramCount <= 0) {
    throw productBridgeError(`sourceId does not support sparse overrides: ${String(sourceId)}`);
  }
  const anchored = typeof morphAnchor === 'number' && Number.isFinite(morphAnchor);
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSourceOverride,
    targetId,
    index: requireIntegerInRange(overrideCount, 'overrideCount', 0, paramCount),
    flags: CORE_PRODUCT_SOURCE_OVERRIDE_FLAGS.commit | (anchored ? CORE_PRODUCT_SOURCE_OVERRIDE_FLAGS.morphAnchored : 0),
    ...(anchored ? { value: requireUnitValue(morphAnchor, 'morphAnchor') } : {}),
  };
}

export function createCoreProductJourneyEvent(enabled: boolean): CoreProductEvent {
  return {
    eventKind: enabled
      ? KESSHO_PRODUCT_EVENT_IDS.StartJourneyMorphClock
      : KESSHO_PRODUCT_EVENT_IDS.StopJourneyMorphClock,
  };
}

export function createCoreProductJourneyStateEvent(
  enabled: boolean,
  phase = 0,
  rateBars = 8,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyState,
    value: enabled ? 1 : 0,
    value2: requireUnitValue(phase, 'phase'),
    value3: requirePositiveFinite(rateBars, 'rateBars'),
  };
}

export function createCoreProductHarmonyControlSetModeEvent(mode: 0 | 1 | 2): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyControlSetMode,
    value: requireIntegerInRange(mode, 'mode', 0, 2),
  };
}

export function createCoreProductHarmonyControlSetStrengthEvent(strength: HarmonyControlStrength): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyControlSetStrength,
    value: HARMONY_STRENGTH_IDS[strength],
  };
}

export function createCoreProductHarmonyControlSetManualIntentEvent(args: {
  degree: number;
  quality?: HarmonyChordQuality;
  rootNote?: number;
  strength?: HarmonyControlStrength;
}): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyControlSetManualIntent,
    value: requireIntegerInRange(args.degree, 'degree', 0, 6),
    value2: HARMONY_QUALITY_IDS[args.quality ?? 'auto'],
    value3: requireIntegerInRange(args.rootNote ?? 0, 'rootNote', 0, 11),
    value4: HARMONY_STRENGTH_IDS[args.strength ?? 'bias'],
  };
}

export function createCoreProductHarmonyControlClearManualIntentEvent(): CoreProductEvent {
  return { eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonyControlClearManualIntent };
}

export function createCoreProductHarmonySlotSetEvent(slotId: number, args: {
  degree: number;
  quality?: HarmonyChordQuality;
  rootNote?: number;
  strength?: HarmonyControlStrength;
}): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonySlotSet,
    index: requireIntegerInRange(slotId, 'slotId', 0, HARMONY_SLOT_COUNT - 1),
    value: requireIntegerInRange(args.degree, 'degree', 0, 6),
    value2: HARMONY_QUALITY_IDS[args.quality ?? 'auto'],
    value3: requireIntegerInRange(args.rootNote ?? 0, 'rootNote', 0, 11),
    value4: HARMONY_STRENGTH_IDS[args.strength ?? 'bias'],
  };
}

export function createCoreProductHarmonySlotTriggerEvent(slotId: number): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonySlotTrigger,
    index: requireIntegerInRange(slotId, 'slotId', 0, HARMONY_SLOT_COUNT - 1),
  };
}

export function createCoreProductHarmonySlotClearEvent(slotId: number): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonySlotClear,
    index: requireIntegerInRange(slotId, 'slotId', 0, HARMONY_SLOT_COUNT - 1),
  };
}

export function createCoreProductHarmonySequenceSetStepEvent(stepId: number, args: {
  degree: number;
  quality?: HarmonyChordQuality;
  rootNote?: number;
  strength?: HarmonyControlStrength;
}): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonySequenceSetStep,
    index: requireIntegerInRange(stepId, 'stepId', 0, HARMONY_SEQUENCE_STEP_COUNT - 1),
    value: requireIntegerInRange(args.degree, 'degree', 0, 6),
    value2: HARMONY_QUALITY_IDS[args.quality ?? 'auto'],
    value3: requireIntegerInRange(args.rootNote ?? 0, 'rootNote', 0, 11),
    value4: HARMONY_STRENGTH_IDS[args.strength ?? 'bias'],
  };
}

export function createCoreProductHarmonySequenceSetEnabledEvent(enabled: boolean): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonySequenceSetEnabled,
    value: enabled ? 1 : 0,
  };
}

export function createCoreProductHarmonySequenceSetActiveStepEvent(stepId: number): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.HarmonySequenceSetActiveStep,
    index: requireIntegerInRange(stepId, 'stepId', 0, HARMONY_SEQUENCE_STEP_COUNT - 1),
  };
}

export function createCoreProductParamEvent(
  paramId: number,
  value: number,
  targetId = 0,
  index = 0,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetParam,
    targetId: requireIntegerInRange(targetId, 'targetId', 0, Number.MAX_SAFE_INTEGER),
    index: requireIntegerInRange(index, 'index', 0, Number.MAX_SAFE_INTEGER),
    paramId: requireParamId(paramId),
    value: requireFiniteNumber(value, 'value'),
  };
}

export const CORE_PRODUCT_SOURCE_ENABLE_FLAGS = {
  immediate: 1 << 0,
} as const;

export function createCoreProductSourceEnabledEvent(
  sourceId: number,
  enabled: boolean,
  options: { immediate?: boolean } = {},
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSourceEnabled,
    targetId: requireIntegerInRange(sourceId, 'sourceId', 1, Number.MAX_SAFE_INTEGER),
    value: enabled ? 1 : 0,
    flags: options.immediate ? CORE_PRODUCT_SOURCE_ENABLE_FLAGS.immediate : 0,
  };
}

export function createCoreProductTransportTransitionEvent(options: {
  bpm: number;
  beatsPerBar: number;
  barsPerPhrase: number;
  phraseSeconds: number;
  applyPolicy?: CoreProductTimingApplyPolicy;
}): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetTransport,
    value: requireNumberInRange(options.bpm, 'bpm', 1, 400),
    value2: requireIntegerInRange(options.beatsPerBar, 'beatsPerBar', 1, 32),
    value3: requireIntegerInRange(options.barsPerPhrase, 'barsPerPhrase', 1, 256),
    value4: requireNumberInRange(options.phraseSeconds, 'phraseSeconds', 0.001, 4096),
    flags: timingApplyFlags(options.applyPolicy ?? 'live'),
  };
}

export function createCoreProductModulationRangeEvent(
  target: CoreProductRangeTarget,
  range: { min: number; max: number } | null,
  mode: CoreProductModulationRangeMode,
  currentValue = 0,
  context: CoreProductRangeValueContext = {},
): CoreProductEvent {
  const targetId = requireIntegerInRange(target.targetId, 'target.targetId', 0, Number.MAX_SAFE_INTEGER);
  const paramId = requireParamId(target.paramId, 'target.paramId');
  const controlId = requireIntegerInRange(target.controlId, 'target.controlId', 1, Number.MAX_SAFE_INTEGER);
  if (!Object.values(CORE_PRODUCT_MODULATION_RANGE_MODE).includes(mode)) {
    throw productBridgeError(`modulation range mode is not known: ${String(mode)}`);
  }
  const hasRange = !!range && Number.isFinite(range.min) && Number.isFinite(range.max);
  const mapValue = target.mapValue ?? ((value: number) => value);
  const min = hasRange ? mapValue(Math.min(range.min, range.max), context) : 0;
  const max = hasRange ? mapValue(Math.max(range.min, range.max), context) : 0;
  const triggerFlag = hasRange && mode === CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold
    ? coreProductSampleHoldTriggerFlag(target.sampleHoldTrigger)
    : 0;
  const randomWalkFlags = hasRange && mode === CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk
    ? coreProductRandomWalkFlags(context)
    : 0;
  const shapeLfoFlags = hasRange && mode === CORE_PRODUCT_MODULATION_RANGE_MODE.shapeLfo
    ? coreProductShapeLfoFlags(context)
    : 0;
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetModulationRange,
    targetId,
    index: controlId,
    paramId,
    value: min,
    value2: max,
    value3: hasRange ? mode : CORE_PRODUCT_MODULATION_RANGE_MODE.off,
    value4: mapValue(currentValue, context),
    flags: hasRange ? CORE_PRODUCT_MODULATION_RANGE_FLAGS.active | triggerFlag | randomWalkFlags | shapeLfoFlags : 0,
  };
}

export function createCoreProductSequencerStepEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  stepIndex: number,
  enabled: boolean,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireIntegerInRange(stepIndex, 'stepIndex', 0, 63),
    value: enabled ? 1 : 0,
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.active,
  };
}

export function createCoreProductSequencerLaneParamEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  paramId: number,
  value: number,
  flags?: number,
): CoreProductEvent {
  const timingParam = paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision ||
    paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneTempoMultiplier ||
    paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing;
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireParamId(paramId),
    value: requireFiniteNumber(value, 'value'),
    flags: flags ?? (timingParam ? timingApplyFlags('live') : 0),
  };
}

export function isCoreProductLiveSequencerTimingEvent(event: CoreProductEvent): boolean {
  if (
    event.eventKind !== KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane ||
    (event.flags ?? 0) !== timingApplyFlags('live')
  ) {
    return false;
  }
  return event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision ||
    event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneTempoMultiplier ||
    event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing;
}

export function createCoreProductAnchorWalkerPerformanceEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  action: CoreProductAnchorWalkerPerformanceAction,
  options: {
    delta?: number;
    velocity?: number;
    midi?: number;
  } = {},
): CoreProductEvent {
  const actionId = CORE_PRODUCT_ANCHOR_WALKER_ACTIONS[action];
  if (actionId == null) {
    throw productBridgeError(`anchor walker action is not known: ${String(action)}`);
  }
  const delta = action === 'gestureDown' || action === 'gestureTap'
    ? requireIntegerInRange(Math.round(requireFiniteNumber(options.delta, 'delta')), 'delta', -7, 7)
    : 0;
  if ((action === 'gestureDown' || action === 'gestureTap') && delta === 0) {
    throw productBridgeError('delta must be non-zero for anchor walker gesture events');
  }
  const velocity = action === 'gestureDown' || action === 'gestureTap'
    ? requirePositiveUnitValue(options.velocity ?? 1, 'velocity')
    : 0;
  const midi = action === 'setManualAnchor'
    ? requireNumberInRange(options.midi, 'midi', 0, 127)
    : 0;
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.AnchorWalkerPerformance,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: actionId,
    value: delta,
    value2: velocity,
    value3: midi,
  };
}

export type CoreProductGeneratedSequencerCaptureMode = 'anchorWalker' | 'orbit';

export function createCoreProductGeneratedSequencerCaptureEvent(request: {
  enabled: boolean;
  sourceLaneIndex: number;
  targetLaneIndex: number;
  sourceMode: CoreProductGeneratedSequencerCaptureMode;
}): CoreProductEvent {
  const sourceModeId = request.sourceMode === 'anchorWalker'
    ? 1
    : 2;
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.GeneratedSequencerCapture,
    targetId: requireSequencerId('synth'),
    index: requireIntegerInRange(request.sourceLaneIndex, 'sourceLaneIndex', 0, 15),
    paramId: requireIntegerInRange(request.targetLaneIndex, 'targetLaneIndex', 0, 15),
    value: request.enabled ? 1 : 0,
    value2: sourceModeId,
  };
}

export function createCoreProductSynthArpConfigEvent(
  laneIndex: number,
  options: {
    enabled: boolean;
    length: number;
    rate: number;
    pulseMask?: number;
    resetMask?: number;
    flow?: 'up' | 'down' | 'upDown' | 'downUp' | 'randomLiveTone' | 'diceHold';
    contourMode?: 'pool' | 'semitone';
    boundaryMode?: 'fold' | 'wrap' | 'clamp';
    fixedMidiMode?: boolean;
  },
): CoreProductEvent {
  const flowIds = { up: 0, down: 1, upDown: 2, downUp: 3, randomLiveTone: 4, diceHold: 5 } as const;
  const boundaryIds = { fold: 0, wrap: 1, clamp: 2 } as const;
  const flags = flowIds[options.flow ?? 'up'] |
    (options.contourMode === 'semitone' ? 1 << 3 : 0) |
    (boundaryIds[options.boundaryMode ?? 'fold'] << 4) |
    (options.fixedMidiMode ? 1 << 6 : 0) |
    (options.flow !== undefined || options.contourMode !== undefined || options.boundaryMode !== undefined ? 1 << 7 : 0);
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSynthArpConfig,
    targetId: requireSequencerId('synth'),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireIntegerInRange(options.pulseMask ?? 0xffff, 'pulseMask', 0, 0xffff),
    value: options.enabled ? 1 : 0,
    value2: requireIntegerInRange(options.length, 'length', 1, 16),
    value3: requireNumberInRange(options.rate, 'rate', 0.25, 4),
    value4: requireIntegerInRange(options.resetMask ?? 0, 'resetMask', 0, 0xffff),
    flags,
  };
}

export function createCoreProductSynthArpStepEvent(
  laneIndex: number,
  stepIndex: number,
  options: {
    midi: number;
    active: boolean;
    contour?: number;
    slot?: number;
    reset?: boolean;
  },
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSynthArpStep,
    targetId: requireSequencerId('synth'),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireIntegerInRange(stepIndex, 'stepIndex', 0, 15),
    value: requireNumberInRange(options.midi, 'midi', -1, 127),
    value2: options.active ? 1 : 0,
    value3: requireIntegerInRange(options.contour ?? 0, 'contour', -12, 12),
    value4: requireIntegerInRange(options.slot ?? -1, 'slot', -1, 7),
    flags: options.reset ? 1 : 0,
  };
}

export function createCoreProductSynthArpCommitEvent(laneIndex: number): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.CommitSynthArpPattern,
    targetId: requireSequencerId('synth'),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
  };
}

export function createCoreProductSequencerClockDivisionEvents(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  divs: readonly unknown[],
): CoreProductEvent[] {
  return Array.from({ length: Math.min(divs.length, 16) }, (_, laneIndex) =>
    createCoreProductSequencerLaneParamEvent(
      sequencer,
      laneIndex,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision,
      sequencerClockDivisionToNumericValue(divs[laneIndex], 16),
      timingApplyFlags('live'),
    ));
}

export function createCoreProductSequencerSwingEvents(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  swings: readonly unknown[],
): CoreProductEvent[] {
  return Array.from({ length: Math.min(swings.length, 16) }, (_, laneIndex) =>
    createCoreProductSequencerLaneParamEvent(
      sequencer,
      laneIndex,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing,
      normalizeSequencerSwing(swings[laneIndex], 0),
      timingApplyFlags('live'),
    ));
}

export function createCoreProductSequencerPitchBindingModeEvents(modes: readonly unknown[]): CoreProductEvent[] {
  return Array.from({ length: Math.min(modes.length, 16) }, (_, laneIndex) => {
    const mode = normalizeSequencerPitchBindingMode(modes[laneIndex]);
    return {
      ...createCoreProductSequencerLaneParamEvent(
        'synth',
        laneIndex,
        KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode,
        sequencerPitchBindingModeToProductId(mode),
      ),
      value2: sequencerPitchBindingModeToEventId(mode),
    };
  });
}

const CORE_PRODUCT_SEQUENCER_PITCH_MODE_IDS = Object.freeze({
  semitones: 0,
  notes: 1,
  noteRange: 2,
} as const);

const CORE_PRODUCT_SEQUENCER_PITCH_SCALE_IDS: Record<string, number> = Object.freeze({
  Harmony: 1,
  Chromatic: 0,
  Major: 1,
  Minor: 2,
  Dorian: 3,
  Phrygian: 4,
  Lydian: 5,
  Mixolydian: 6,
  Locrian: 7,
  Pentatonic: 8,
  'Min Penta': 9,
  Blues: 10,
  'Harmonic Minor': 11,
  'Melodic Minor': 12,
  'Whole Tone': 13,
  Diminished: 14,
  Augmented: 15,
  'Hungarian Minor': 16,
  Japanese: 17,
  Arabic: 18,
});

const CORE_PRODUCT_SEQUENCER_PITCH_EXACT_SCALE_IDS: Record<string, number> = Object.freeze({
  Harmony: 0,
  Chromatic: 1,
  Major: 2,
  Minor: 3,
  Dorian: 4,
  Phrygian: 5,
  Lydian: 6,
  Mixolydian: 7,
  Locrian: 8,
  Pentatonic: 9,
  'Min Penta': 10,
  Blues: 11,
  'Harmonic Minor': 12,
  'Melodic Minor': 13,
  'Whole Tone': 14,
  Diminished: 15,
  Augmented: 16,
  'Hungarian Minor': 17,
  Japanese: 18,
  Arabic: 19,
});

export function createCoreProductSequencerLanePitchSettingEvents(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  settings: unknown,
): CoreProductEvent[] {
  const pitchSettings = normalizeSequencerPitchSettings(settings);
  const scaleEvent = createCoreProductSequencerLaneParamEvent(
    sequencer,
    laneIndex,
    KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchScale,
    CORE_PRODUCT_SEQUENCER_PITCH_SCALE_IDS[pitchSettings.scale] ?? 1,
  );
  return [
    createCoreProductSequencerLaneParamEvent(
      sequencer,
      laneIndex,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchMode,
      CORE_PRODUCT_SEQUENCER_PITCH_MODE_IDS[pitchSettings.mode],
    ),
    createCoreProductSequencerLaneParamEvent(
      sequencer,
      laneIndex,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchRoot,
      pitchSettings.root,
    ),
    {
      ...scaleEvent,
      value2: CORE_PRODUCT_SEQUENCER_PITCH_EXACT_SCALE_IDS[pitchSettings.scale] ?? 2,
    },
  ];
}

export function createCoreProductSequencerPitchSettingEvents(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  settings: readonly unknown[],
): CoreProductEvent[] {
  return Array.from({ length: Math.min(settings.length, 16) }, (_, laneIndex) =>
    createCoreProductSequencerLanePitchSettingEvents(sequencer, laneIndex, settings[laneIndex])
  ).flat();
}

export function createCoreProductSequencerStepValueEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  stepIndex: number,
  field: CoreProductStepValueField,
  value: number,
  value2 = 0,
  extraFlags = 0,
): CoreProductEvent {
  return createCoreProductSequencerExtendedStepValueEvent(sequencer, laneIndex, stepIndex, field, value, value2, 0, 0, extraFlags);
}

export function createCoreProductSequencerExtendedStepValueEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  stepIndex: number,
  field: CoreProductStepValueField,
  value: number,
  value2 = 0,
  value3 = 0,
  value4 = 0,
  extraFlags = 0,
): CoreProductEvent {
  const validatedField = requireStepField(field);
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireIntegerInRange(stepIndex, 'stepIndex', 0, 63),
    value: requireFiniteNumber(value, 'value'),
    value2: requireFiniteNumber(value2, 'value2'),
    value3: requireFiniteNumber(value3, 'value3'),
    value4: requireFiniteNumber(value4, 'value4'),
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.active | validatedField | extraFlags,
  };
}

export function createCoreProductSequencerSubLaneConfigEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  field: CoreProductStepValueField,
  steps: number,
  direction: CoreProductSubLaneDirection,
  enabled = true,
  extraFlags = 0,
): CoreProductEvent {
  const validatedField = requireStepField(field);
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireIntegerInRange(validatedField / (1 << 8), 'field index', 0, 15),
    value: enabled ? 1 : 0,
    value2: requireIntegerInRange(steps, 'steps', 1, 64),
    value3: requireSubLaneDirection(direction),
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.active | CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig | extraFlags,
  };
}

export function createCoreProductSequencerClearStepsEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.clearLane,
  };
}

export function createCoreProductSequencerStepOverrideCommitEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  extraFlags = 0,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.stepOverrideCommit | extraFlags,
  };
}

export function createCoreProductSequencerHomeCaptureEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  pitchState?: { steps?: unknown; direction?: unknown; scaleQuantize?: unknown } | null,
  options: { force?: boolean; requireContent?: boolean } = {},
): CoreProductEvent {
  const pitchSteps = typeof pitchState?.steps === 'number' && Number.isFinite(pitchState.steps)
    ? requireIntegerInRange(Math.round(pitchState.steps), 'pitchState.steps', 1, 64)
    : 0;
  const pitchDirection = encodeCoreProductHomePitchDirection(pitchState?.direction);
  const hasPitchState = pitchSteps > 0 || pitchDirection >= 0 || typeof pitchState?.scaleQuantize === 'boolean';
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    value: (options.force ? CORE_PRODUCT_HOME_CAPTURE_FLAGS.force : 0) |
      (options.requireContent ? CORE_PRODUCT_HOME_CAPTURE_FLAGS.requireContent : 0) |
      (hasPitchState ? CORE_PRODUCT_HOME_CAPTURE_FLAGS.hasPitchState : 0) |
      (typeof pitchState?.scaleQuantize === 'boolean' ? CORE_PRODUCT_HOME_CAPTURE_FLAGS.pitchScaleQuantizeSet : 0) |
      (pitchState?.scaleQuantize === true ? CORE_PRODUCT_HOME_CAPTURE_FLAGS.pitchScaleQuantize : 0),
    value2: pitchSteps,
    value3: pitchDirection,
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.homeCaptureState,
  };
}

function encodeCoreProductHomePitchDirection(value: unknown): number {
  const text = String(value ?? '').toLowerCase();
  if (text === 'forward') return CORE_PRODUCT_SUBLANE_DIRECTIONS.forward;
  if (text === 'reverse') return CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse;
  if (text === 'pingpong') return CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong;
  return -1;
}

export function createCoreProductSequencerResetHomeEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.ResetSequencerLaneHome,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
  };
}

export function createCoreProductSequencerDiceEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  intensity = 1,
  seed = 0,
  flags = 0,
  writeOffset = 0,
  barIndex = 0,
  effectiveTension?: number,
): CoreProductEvent {
  const encodedTension = encodeCoreProductSequencerEvolveTension(effectiveTension);
  const usesRngStream = (flags & CORE_PRODUCT_EVOLVE_FLAGS.rngStream) !== 0;
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    ...(usesRngStream
      ? { paramId: requireIntegerInRange(seed, 'rngStreamSeed', 0, 0xffffffff) }
      : encodedTension > 0 ? { paramId: encodedTension } : {}),
    value: requireUnitValue(intensity, 'intensity'),
    value2: usesRngStream ? encodedTension : requireIntegerInRange(seed, 'seed', 0, 0xffffffff),
    value3: requireIntegerInRange(writeOffset, 'writeOffset', -1, 64),
    value4: requireIntegerInRange(barIndex, 'barIndex', 0, 0xffffffff),
    flags: requireIntegerInRange(flags, 'flags', 0, 0xffffffff),
  };
}

export function createCoreProductMidiEvent(event: {
  sampleOffset?: number;
  targetId?: number;
  ownerToken?: number;
  status: number;
  channel?: number;
  data1?: number;
  data2?: number;
  normalizedValue?: number;
  rawSize?: number;
}): CoreProductEvent {
  const status = requireIntegerInRange(event.status, 'status', 0, 255);
  const inferredChannel = status < 0xf0 ? status & 0x0f : 0;
  const channel = requireIntegerInRange(event.channel ?? inferredChannel, 'channel', 0, 15);
  const targetId = event.targetId === undefined ? 0 : requireSourceId(event.targetId, 'targetId');
  return {
    sampleOffset: requireIntegerInRange(event.sampleOffset ?? 0, 'sampleOffset', 0, Number.MAX_SAFE_INTEGER),
    eventKind: KESSHO_PRODUCT_EVENT_IDS.MidiEvent,
    targetId,
    index: channel,
    paramId: requireIntegerInRange(event.ownerToken ?? 0, 'ownerToken', 0, 0xffffffff),
    value: status,
    value2: requireIntegerInRange(event.data1 ?? 0, 'data1', 0, 127),
    value3: requireIntegerInRange(event.data2 ?? 0, 'data2', 0, 127),
    value4: requireUnitValue(event.normalizedValue ?? 0, 'normalizedValue'),
    flags: requireIntegerInRange(event.rawSize ?? 0, 'rawSize', 0, 16),
  };
}
