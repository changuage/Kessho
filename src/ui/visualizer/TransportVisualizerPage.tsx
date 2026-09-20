import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProductEngineState } from '../../audio/product/ProductEngineTypes';
import { getLeadDistancePreview, getPadDistancePreview } from '../../audio/distanceMacro';
import { mulberry32 } from '../../audio/rng';
import type { PresetSummary } from '../../presets/types';
import type { SliderMode, SliderState } from '../state';
import { useAnimationVisibility } from '../hooks/useAnimationVisibility';
import {
  TRANSPORT_CONTROL_GROUPS,
  TRANSPORT_CONTROL_DEFINITIONS,
  TRANSPORT_DEFAULT_CONTROLS,
  TRANSPORT_MASTER_CONTROLS,
  TRANSPORT_PRESETS,
  expandTransportPreset,
  getTransportControlDefinition,
  getTransportPreset,
  normalizeTransportControls,
  type TransportControlDefinition,
  type TransportControls,
} from './visualizerTransportSchema';
import {
  TRANSPORT_ASSIGNMENT_MAX_ROUTES,
  TRANSPORT_ASSIGNMENT_SIGNAL_COUNT,
  TRANSPORT_ASSIGNMENT_SIGNALS,
  TRANSPORT_ASSIGNMENT_SOURCES,
  compileTransportAssignments,
  createTransportAssignmentSmoothingState,
  evaluateTransportAssignments,
  isTransportAssignmentTarget,
  sanitizeTransportAssignments,
  smoothTransportAssignmentControls,
  type CompiledTransportAssignments,
  type TransportAssignment,
  type TransportAssignmentPolarity,
} from './transportAssignments';
import {
  TRANSPORT_MAX_IMPULSES,
  TransportVisualizerRenderer,
  type TransportImpulse,
  type TransportPerformanceTier,
  type TransportVisualizerFrame,
} from './TransportVisualizerRenderer';
import {
  getVisualizerPulseSnapshot,
  setVisualizerSignalDemand,
  subscribeVisualizerSignals,
  type VisualizerPulseSnapshot,
} from './visualizerSignals';
import { readVisualizerTelemetrySignal } from './visualizerTelemetry';
import {
  loadTransportVisualizerPreset,
  listVisualizerPresets,
  saveTransportVisualizerPreset,
  type TransportVisualizerPresetData,
} from './visualizerPresetStore';
import type { VisualizerTelemetrySignal } from './visualizerTelemetry';
import {
  resolveVisualizerFramePlan,
  type VisualizerFrameMode,
  type VisualizerFramePlan,
} from './visualizerFrameScheduler';
import {
  resolveVisualizerQualityMode,
  type VisualizerQualityMode,
  type VisualizerQualitySettings,
} from './visualizerQuality';
import { VisualizerCanvasSurface } from './VisualizerCanvasSurface';
import { subscribeProductInteractionEvents } from '../../audio/productInteractionEventStore';
import {
  PRODUCT_INTERACTION_CHILD,
  PRODUCT_INTERACTION_EVENT,
  PRODUCT_INTERACTION_PARENT,
  type ProductInteractionEvent,
} from '../../audio/productInteractionVocabulary';

type DualRanges = Record<string, { min: number; max: number } | undefined>;

interface Props {
  state: SliderState;
  sliderModes: Record<string, SliderMode>;
  dualRanges: DualRanges;
  engineState: ProductEngineState;
  isPlaying: boolean;
  getActiveGrains: () => number;
  linkedPresetRequest: { name: string; nonce: number } | null;
  onVisualizerPresetChange: React.Dispatch<React.SetStateAction<string>>;
  enabled?: boolean;
  mobileReducedVisuals?: boolean;
}

export interface TransportFramePlanInput {
  canAnimate: boolean;
  isPlaying: boolean;
  motion: number;
  pulseActivity: number;
  millisecondsSinceInteraction: number;
  qualityTargetFps: number;
}

export function resolveTransportFramePlan(params: TransportFramePlanInput): VisualizerFramePlan {
  const requestedFps = params.qualityTargetFps;
  return resolveVisualizerFramePlan({
    canAnimate: params.canAnimate,
    isPlaying: params.isPlaying,
    // Transport motion is the page's only continuous host animation signal.
    hasAutomation: Number.isFinite(params.motion) && params.motion > 0,
    pulseActivity: params.pulseActivity,
    millisecondsSinceInteraction: params.millisecondsSinceInteraction,
    requestedFps,
    qualityTargetFps: params.qualityTargetFps,
  });
}

export interface TransportPerformanceGovernorInput {
  timeMs: number;
  isPlaying: boolean;
  active: boolean;
  requestedMode: VisualizerQualityMode;
  effectiveMode: VisualizerQualitySettings['effectiveMode'];
  targetFps: number;
}

export interface TransportPerformanceGovernorState {
  tier: TransportPerformanceTier;
  emaFps: number;
  lastFrameMs: number;
  lowSinceMs: number;
  nearSinceMs: number;
  lastTargetFps: number;
  lastRequestedMode: VisualizerQualityMode | null;
  lastEffectiveMode: VisualizerQualitySettings['effectiveMode'] | null;
  running: boolean;
  active: boolean;
  reportedFps: number;
  reportedAtMs: number;
}

export const TRANSPORT_PERFORMANCE_LOW_RATIO = 0.82;
export const TRANSPORT_PERFORMANCE_NEAR_RATIO = 0.92;
export const TRANSPORT_PERFORMANCE_LOW_HOLD_MS = 1200;
export const TRANSPORT_PERFORMANCE_MINIMUM_RECOVERY_MS = 5000;
export const TRANSPORT_PERFORMANCE_BALANCED_RECOVERY_MS = 8000;
export const TRANSPORT_PERFORMANCE_REPORT_INTERVAL_MS = 250;

export function resolveTransportGovernorTier(
  requestedMode: VisualizerQualityMode,
  effectiveMode: VisualizerQualitySettings['effectiveMode'],
): TransportPerformanceTier {
  if (effectiveMode === 'mobileSafe' || requestedMode === 'mobileSafe') return 'minimum';
  if (requestedMode === 'desktopBeauty') return 'full';
  return 'balanced';
}

export function createTransportPerformanceGovernorState(): TransportPerformanceGovernorState {
  return {
    tier: 'balanced',
    emaFps: 0,
    lastFrameMs: Number.NaN,
    lowSinceMs: Number.NaN,
    nearSinceMs: Number.NaN,
    lastTargetFps: 0,
    lastRequestedMode: null,
    lastEffectiveMode: null,
    running: false,
    active: false,
    reportedFps: 0,
    reportedAtMs: Number.NEGATIVE_INFINITY,
  };
}

function resetTransportGovernorStreaks(state: TransportPerformanceGovernorState): void {
  state.lowSinceMs = Number.NaN;
  state.nearSinceMs = Number.NaN;
}

export function resetTransportPerformanceGovernor(state: TransportPerformanceGovernorState): void {
  state.emaFps = 0;
  state.lastFrameMs = Number.NaN;
  resetTransportGovernorStreaks(state);
  state.running = false;
  state.active = false;
  state.reportedFps = 0;
  state.reportedAtMs = Number.NEGATIVE_INFINITY;
}

export function updateTransportPerformanceGovernor(
  state: TransportPerformanceGovernorState,
  input: TransportPerformanceGovernorInput,
): TransportPerformanceTier {
  const targetFps = Number.isFinite(input.targetFps) ? Math.max(1, input.targetFps) : 60;
  const nowMs = Number.isFinite(input.timeMs)
    ? input.timeMs
    : (Number.isFinite(state.lastFrameMs) ? state.lastFrameMs : 0);
  const requestedTier = resolveTransportGovernorTier(input.requestedMode, input.effectiveMode);
  const adaptive = input.requestedMode === 'auto' && input.effectiveMode === 'desktopBeauty';
  // A stopped pulse can keep the scheduler alive while it settles. It must not
  // be treated as a performance sample; only playing active frames are
  // representative of the governor's target cadence.
  const running = input.isPlaying && input.active;
  const modeChanged = state.lastRequestedMode !== input.requestedMode
    || state.lastEffectiveMode !== input.effectiveMode
    || state.lastTargetFps !== targetFps;

  if (modeChanged) {
    state.lastRequestedMode = input.requestedMode;
    state.lastEffectiveMode = input.effectiveMode;
    state.lastTargetFps = targetFps;
    state.tier = requestedTier;
    state.emaFps = 0;
    state.lastFrameMs = nowMs;
    resetTransportGovernorStreaks(state);
    state.running = running;
    state.active = input.active;
    state.reportedFps = 0;
    state.reportedAtMs = Number.NEGATIVE_INFINITY;
    return state.tier;
  }

  if (!running) {
    if (state.running) resetTransportPerformanceGovernor(state);
    state.active = false;
    return state.tier;
  }

  if (state.active !== input.active) {
    state.active = input.active;
    state.reportedFps = 0;
    state.reportedAtMs = Number.NEGATIVE_INFINITY;
  }

  if (!state.running) {
    state.running = true;
    state.lastFrameMs = nowMs;
    state.emaFps = 0;
    resetTransportGovernorStreaks(state);
    return state.tier;
  }

  const deltaMs = nowMs - state.lastFrameMs;
  state.lastFrameMs = nowMs;
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 1000) {
    state.emaFps = 0;
    resetTransportGovernorStreaks(state);
    return state.tier;
  }

  const measuredFps = Math.min(targetFps * 2, 1000 / deltaMs);
  state.emaFps = state.emaFps > 0
    ? state.emaFps * 0.8 + measuredFps * 0.2
    : measuredFps;

  if (!adaptive) {
    state.tier = requestedTier;
    resetTransportGovernorStreaks(state);
    return state.tier;
  }

  const low = state.emaFps < targetFps * TRANSPORT_PERFORMANCE_LOW_RATIO;
  const near = state.emaFps >= targetFps * TRANSPORT_PERFORMANCE_NEAR_RATIO;
  if (low) {
    if (!Number.isFinite(state.lowSinceMs)) state.lowSinceMs = nowMs;
    state.nearSinceMs = Number.NaN;
    if (nowMs - state.lowSinceMs >= TRANSPORT_PERFORMANCE_LOW_HOLD_MS) {
      if (state.tier === 'full') state.tier = 'balanced';
      else if (state.tier === 'balanced') state.tier = 'minimum';
      resetTransportGovernorStreaks(state);
    }
  } else {
    state.lowSinceMs = Number.NaN;
    if (near) {
      if (!Number.isFinite(state.nearSinceMs)) state.nearSinceMs = nowMs;
      const recoveryMs = state.tier === 'minimum'
        ? TRANSPORT_PERFORMANCE_MINIMUM_RECOVERY_MS
        : TRANSPORT_PERFORMANCE_BALANCED_RECOVERY_MS;
      if (nowMs - state.nearSinceMs >= recoveryMs) {
        if (state.tier === 'minimum') state.tier = 'balanced';
        else if (state.tier === 'balanced') state.tier = 'full';
        resetTransportGovernorStreaks(state);
      }
    } else {
      state.nearSinceMs = Number.NaN;
    }
  }
  return state.tier;
}

export function shouldPublishTransportFps(
  state: TransportPerformanceGovernorState,
  timeMs: number,
  active: boolean,
): boolean {
  if (!state.running || !active || !Number.isFinite(state.emaFps) || !Number.isFinite(timeMs)) return false;
  const rounded = Math.max(0, Math.round(state.emaFps));
  return rounded !== state.reportedFps
    && timeMs - state.reportedAtMs >= TRANSPORT_PERFORMANCE_REPORT_INTERVAL_MS;
}

export function markTransportFpsReported(
  state: TransportPerformanceGovernorState,
  timeMs: number,
): number {
  state.reportedFps = Math.max(0, Math.round(state.emaFps));
  state.reportedAtMs = Number.isFinite(timeMs) ? timeMs : state.reportedAtMs;
  return state.reportedFps;
}

export type TransportImpulseProfileName = 'drums' | 'synth-or-lead' | 'pad' | 'granular';

export interface TransportImpulseProfile {
  readonly speed: number;
  readonly frequency: number;
  readonly decay: number;
  readonly tight: number;
}

const TRANSPORT_IMPULSE_PROFILES: Record<TransportImpulseProfileName, TransportImpulseProfile> = {
  drums: { speed: 0.96, frequency: 38, decay: 1.8, tight: 10 },
  'synth-or-lead': { speed: 0.62, frequency: 25, decay: 1.25, tight: 6 },
  pad: { speed: 0.28, frequency: 13, decay: 0.58, tight: 2.2 },
  granular: { speed: 0.82, frequency: 48, decay: 2.5, tight: 13 },
};

export function resolveTransportImpulseProfile(source: string): TransportImpulseProfileName {
  const normalized = source.toLowerCase();
  if (normalized.includes('drum')) return 'drums';
  if (normalized.includes('pad')) return 'pad';
  if (normalized.includes('gran')) return 'granular';
  return 'synth-or-lead';
}

export function getTransportImpulseProfile(source: string): TransportImpulseProfile {
  return TRANSPORT_IMPULSE_PROFILES[resolveTransportImpulseProfile(source)];
}

export const TRANSPORT_PULSE_RISE_DRUMS = 1;
export const TRANSPORT_PULSE_RISE_SYNTH = 2;
export const TRANSPORT_PULSE_RISE_LEAD = 4;
export const TRANSPORT_PULSE_RISE_PAD = 8;
export const TRANSPORT_PULSE_RISE_GRANULAR = 16;
const TRANSPORT_PULSE_RISE_THRESHOLD = 0.02;

export interface TransportPulseRiseState {
  drums: number;
  synth: number;
  lead: number;
  pad: number;
  granular: number;
  sampledAt: number;
  activity: number;
  activityUpdatedAt: number;
}

export function createTransportPulseRiseState(): TransportPulseRiseState {
  return {
    drums: 0,
    synth: 0,
    lead: 0,
    pad: 0,
    granular: 0,
    sampledAt: 0,
    activity: 0,
    activityUpdatedAt: 0,
  };
}

function safePulse(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function resolveTransportRippleCharacter(
  event: ProductInteractionEvent,
  state: SliderState,
): { strength: number; size: number } {
  let distance = 0;
  let cutoffHz = 20_000;
  if (event.child === PRODUCT_INTERACTION_CHILD.pad1 || event.child === PRODUCT_INTERACTION_CHILD.pad2) {
    const pad = event.child === PRODUCT_INTERACTION_CHILD.pad2 ? 'pad2' : 'pad1';
    const preview = getPadDistancePreview(state, pad);
    distance = safePulse(pad === 'pad2' ? state.pad2Distance : state.padDistance);
    cutoffHz = Math.min(
      Number(pad === 'pad2' ? preview.pad2FilterCutoff : preview.filterCutoff),
      Number(pad === 'pad2' ? preview.pad2PostLPF : preview.padPostLPF),
    );
  } else if (event.child === PRODUCT_INTERACTION_CHILD.lead1 || event.child === PRODUCT_INTERACTION_CHILD.lead2) {
    const lead = event.child === PRODUCT_INTERACTION_CHILD.lead2 ? 'lead2' : 'lead1';
    const preview = getLeadDistancePreview(state, lead);
    distance = safePulse(lead === 'lead2' ? state.lead2Distance : state.lead1Distance);
    cutoffHz = Number(lead === 'lead2' ? preview.lead2PostLPF : preview.lead1PostLPF);
  }
  const velocity = safePulse(event.strength);
  const midi = Math.max(0, Math.min(127, Number.isFinite(event.value) ? event.value : 60));
  const pitchHz = 440 * 2 ** ((midi - 69) / 12);
  const openness = Math.max(0, Math.min(1, (Math.log2(Math.max(20, cutoffHz) / pitchHz) + 0.5) / 4));
  const pitchSize = 1.1 - Math.max(0, Math.min(1, (midi - 36) / 60)) * 0.4;
  const size = Math.max(0.2, Math.min(1.45,
    0.22 + 1.13 * velocity ** 0.8 * pitchSize * (0.4 + 0.6 * openness) * (1 - distance * 0.45)));
  return { size, strength: velocity * (0.5 + 0.5 * openness) * (1 - distance * 0.55) };
}

export function updateTransportPulseRiseState(
  state: TransportPulseRiseState,
  snapshot: VisualizerPulseSnapshot,
  nowMs: number,
): number {
  const drums = safePulse(snapshot.drums);
  const synth = safePulse(snapshot.synth);
  const lead = safePulse(snapshot.lead);
  const pad = safePulse(snapshot.pad);
  const granular = safePulse(snapshot.granular);
  const now = Number.isFinite(nowMs) ? nowMs : state.sampledAt;
  const sampleElapsed = Math.max(0, now - state.sampledAt);
  const previousDrums = state.drums * Math.exp(-sampleElapsed / 520);
  const previousSynth = state.synth * Math.exp(-sampleElapsed / 900);
  const previousLead = state.lead * Math.exp(-sampleElapsed / 780);
  const previousPad = state.pad * Math.exp(-sampleElapsed / 1200);
  const previousGranular = state.granular * Math.exp(-sampleElapsed / 820);
  let rises = 0;
  if (drums !== state.drums && drums > previousDrums + TRANSPORT_PULSE_RISE_THRESHOLD) rises |= TRANSPORT_PULSE_RISE_DRUMS;
  if (synth !== state.synth && synth > previousSynth + TRANSPORT_PULSE_RISE_THRESHOLD) rises |= TRANSPORT_PULSE_RISE_SYNTH;
  if (lead !== state.lead && lead > previousLead + TRANSPORT_PULSE_RISE_THRESHOLD) rises |= TRANSPORT_PULSE_RISE_LEAD;
  if (pad !== state.pad && pad > previousPad + TRANSPORT_PULSE_RISE_THRESHOLD) rises |= TRANSPORT_PULSE_RISE_PAD;
  if (granular !== state.granular && granular > previousGranular + TRANSPORT_PULSE_RISE_THRESHOLD) rises |= TRANSPORT_PULSE_RISE_GRANULAR;
  state.drums = drums;
  state.synth = synth;
  state.lead = lead;
  state.pad = pad;
  state.granular = granular;
  state.sampledAt = now;

  const elapsed = Math.max(0, now - state.activityUpdatedAt);
  const decayedCurrent = state.activity * Math.exp(-elapsed / 1000);
  const amount = pulseActivity(snapshot);
  if (rises !== 0 && amount > decayedCurrent) {
    state.activity = amount;
    state.activityUpdatedAt = now;
  }
  return rises;
}

export function getTransportPulseActivity(state: TransportPulseRiseState, nowMs: number): number {
  const now = Number.isFinite(nowMs) ? nowMs : state.activityUpdatedAt;
  const elapsed = Math.max(0, now - state.activityUpdatedAt);
  const activity = state.activity * Math.exp(-elapsed / 1000);
  return activity < 0.0005 ? 0 : activity;
}

export function resolveTransportImpulsePosition(
  source: string,
  phase: number,
  seed: number,
): { x: number; y: number } {
  const sourceOffset = resolveTransportImpulseProfile(source).length * 0.73;
  const safePhase = Number.isFinite(phase) ? phase : 0;
  const safeSeed = Number.isFinite(seed) ? seed : 0;
  const angle = safePhase * Math.PI * 2 + safeSeed * 0.017 + sourceOffset;
  const radius = 0.18 + ((Math.sin(safeSeed * 0.131 + sourceOffset) + 1) * 0.5) * 0.56;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export class TransportImpulseRing {
  private readonly slots: Array<{ -readonly [K in keyof TransportImpulse]: TransportImpulse[K] }>;
  private next = 0;
  private size = 0;

  constructor(readonly capacity = TRANSPORT_MAX_IMPULSES) {
    const count = Math.max(1, Math.min(TRANSPORT_MAX_IMPULSES, Math.floor(capacity)));
    this.capacity = count;
    this.slots = Array.from({ length: count }, () => ({
      x: 0,
      y: 0,
      timeMs: 0,
      strength: 0,
      speed: 0,
      frequency: 0,
      decay: 0,
      tight: 0,
    }));
  }

  get length(): number {
    return this.size;
  }

  clear(): void {
    this.next = 0;
    this.size = 0;
  }

  push(impulse: Readonly<TransportImpulse>): void {
    const slot = this.slots[this.next]!;
    slot.x = Number.isFinite(impulse.x) ? impulse.x : 0;
    slot.y = Number.isFinite(impulse.y) ? impulse.y : 0;
    slot.timeMs = Number.isFinite(impulse.timeMs) ? impulse.timeMs : 0;
    slot.strength = Number.isFinite(impulse.strength) ? Math.max(0, Math.min(1, impulse.strength)) : 0;
    slot.speed = Number.isFinite(impulse.speed) ? impulse.speed : 0;
    slot.frequency = Number.isFinite(impulse.frequency) ? impulse.frequency : 0;
    slot.decay = Number.isFinite(impulse.decay) ? impulse.decay : 0;
    slot.tight = Number.isFinite(impulse.tight) ? impulse.tight : 0;
    this.next = (this.next + 1) % this.capacity;
    this.size = Math.min(this.capacity, this.size + 1);
  }

  writeTo(target: TransportImpulse[]): number {
    const start = (this.next - this.size + this.capacity) % this.capacity;
    for (let index = 0; index < this.size; index += 1) {
      target[index] = this.slots[(start + index) % this.capacity]!;
    }
    target.length = this.size;
    return this.size;
  }
}

function queueTransportImpulse(
  ring: TransportImpulseRing,
  source: string,
  amount: number,
  phase: number,
  timeMs: number,
  seed: number,
  reactGain: number,
  size = 1,
): void {
  const position = resolveTransportImpulsePosition(source, phase, seed);
  const profile = getTransportImpulseProfile(source);
  const safeSize = Math.max(0.25, Math.min(1.5, Number.isFinite(size) ? size : 1));
  ring.push({
    ...position,
    timeMs,
    strength: Math.min(1, safePulse(amount) * reactGain),
    speed: profile.speed * safeSize,
    frequency: profile.frequency / Math.sqrt(safeSize),
    decay: profile.decay / safeSize,
    tight: profile.tight / (safeSize * safeSize),
  });
}

export function resolveTransportInteractionEventSource(event: ProductInteractionEvent): string | null {
  if (event.type !== PRODUCT_INTERACTION_EVENT.voiceTriggered &&
      event.type !== PRODUCT_INTERACTION_EVENT.drumTriggered &&
      event.type !== PRODUCT_INTERACTION_EVENT.sampleTriggered &&
      event.type !== PRODUCT_INTERACTION_EVENT.textureStarted) return null;
  if (event.parent === PRODUCT_INTERACTION_PARENT.drums) return 'drums';
  if (event.child === PRODUCT_INTERACTION_CHILD.pad1 || event.child === PRODUCT_INTERACTION_CHILD.pad2) return 'pad';
  if (event.child === PRODUCT_INTERACTION_CHILD.lead1 || event.child === PRODUCT_INTERACTION_CHILD.lead2) return 'lead';
  if (event.parent === PRODUCT_INTERACTION_PARENT.samples ||
      event.parent === PRODUCT_INTERACTION_PARENT.soundscape) return 'earth';
  return 'synth';
}

export function resolveTransportPresetRequest(nameOrId: string) {
  return getTransportPreset(nameOrId) ?? null;
}

export function resolveTransportNativeStep(definition: Pick<TransportControlDefinition, 'step'>): number | 'any' {
  return definition.step ?? 'any';
}

const DEFAULT_TRANSPORT_ASSIGNMENT_INPUTS = [
  { id: 'drums-transient-bloom', source: 'drums', signal: 'transient', target: 'bloom', amount: 0.18, polarity: 'unipolar', enabled: true },
  { id: 'synth-transient-bloom', source: 'synth', signal: 'transient', target: 'bloom', amount: 0.08, polarity: 'unipolar', enabled: true },
  { id: 'pad-transient-exposure', source: 'pad', signal: 'transient', target: 'exposure', amount: 0.02, polarity: 'unipolar', enabled: true },
  { id: 'granular-transient-bloom', source: 'granular', signal: 'transient', target: 'bloom', amount: 0.04, polarity: 'unipolar', enabled: true },
] as const;

export function createDefaultTransportAssignments(): TransportAssignment[] {
  return sanitizeTransportAssignments(DEFAULT_TRANSPORT_ASSIGNMENT_INPUTS);
}

function transportAssignmentSourceIndex(source: string): number {
  return TRANSPORT_ASSIGNMENT_SOURCES.indexOf(source as typeof TRANSPORT_ASSIGNMENT_SOURCES[number]);
}

function transportAssignmentSignalIndex(signal: string): number {
  return TRANSPORT_ASSIGNMENT_SIGNALS.indexOf(signal as typeof TRANSPORT_ASSIGNMENT_SIGNALS[number]);
}

export interface TransportTriggerCharacterState {
  values: Float32Array;
  updatedAt: Float64Array;
}

export function createTransportTriggerCharacterState(): TransportTriggerCharacterState {
  return { values: new Float32Array(TRANSPORT_ASSIGNMENT_SOURCES.length), updatedAt: new Float64Array(TRANSPORT_ASSIGNMENT_SOURCES.length) };
}

export function recordTransportTriggerCharacter(
  state: TransportTriggerCharacterState, source: string, value: number, at: number,
): void {
  const write = (key: string, amount: number) => {
    const index = transportAssignmentSourceIndex(key);
    if (index < 0) return;
    const elapsed = Math.max(0, at - (state.updatedAt[index] ?? 0));
    state.values[index] = Math.max((state.values[index] ?? 0) * Math.exp(-elapsed / 700), safePulse(amount));
    state.updatedAt[index] = at;
  };
  write(source, value);
  if (source === 'pad' || source === 'lead') write('synth', value);
  if (source !== 'global') write('global', value * 0.32);
}

function readTransportTriggerCharacter(state: TransportTriggerCharacterState, source: string, at: number): number | null {
  const index = transportAssignmentSourceIndex(source);
  if (index < 0 || (state.updatedAt[index] ?? 0) <= 0) return null;
  const value = (state.values[index] ?? 0) * Math.exp(-Math.max(0, at - state.updatedAt[index]!) / 700);
  return value < 0.001 ? null : value;
}

export function transportAssignmentSignalSlot(
  source: string,
  signal: VisualizerTelemetrySignal,
): number {
  const sourceIndex = transportAssignmentSourceIndex(source);
  const signalIndex = transportAssignmentSignalIndex(signal);
  return sourceIndex < 0 || signalIndex < 0
    ? -1
    : sourceIndex * TRANSPORT_ASSIGNMENT_SIGNAL_COUNT + signalIndex;
}

export function fillTransportAssignmentSignals(
  output: Float32Array,
  timeMs: number,
  triggerCharacters?: TransportTriggerCharacterState,
): Float32Array {
  for (let sourceIndex = 0; sourceIndex < TRANSPORT_ASSIGNMENT_SOURCES.length; sourceIndex += 1) {
    const source = TRANSPORT_ASSIGNMENT_SOURCES[sourceIndex]!;
    for (let signalIndex = 0; signalIndex < TRANSPORT_ASSIGNMENT_SIGNALS.length; signalIndex += 1) {
      const signal = TRANSPORT_ASSIGNMENT_SIGNALS[signalIndex]!;
      const slot = sourceIndex * TRANSPORT_ASSIGNMENT_SIGNAL_COUNT + signalIndex;
      const value = (signal === 'transient' && triggerCharacters
        ? readTransportTriggerCharacter(triggerCharacters, source, timeMs)
        : null) ?? readVisualizerTelemetrySignal(source, signal, timeMs) ?? 0;
      output[slot] = Number.isFinite(value) ? value : 0;
    }
  }
  return output;
}

export function readTransportAssignmentSignalValue(
  signals: Float32Array,
  source: string,
  signal: VisualizerTelemetrySignal,
): number {
  const slot = transportAssignmentSignalSlot(source, signal);
  if (slot < 0 || slot >= signals.length) return 0;
  const value = signals[slot];
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

export function createTransportVisualizerPresetData(
  controls: TransportControls,
  assignments: readonly TransportAssignment[],
  qualityMode: VisualizerQualityMode,
  seed: number,
): TransportVisualizerPresetData {
  return {
    format: 'kessho-visualizer-preset',
    formatVersion: 3,
    renderer: 'transport',
    controls: normalizeTransportControls(controls),
    assignments: sanitizeTransportAssignments(assignments),
    qualityMode,
    seed: Number.isFinite(seed) ? seed : 0,
  };
}

export function filterTransportPresetSummaries(
  summaries: readonly PresetSummary[],
): PresetSummary[] {
  return summaries.filter((summary) => summary.tags?.includes('transport') === true);
}

export function resolveTransportPresetLoadKind(nameOrId: string): 'built-in' | 'saved' {
  return getTransportPreset(nameOrId) ? 'built-in' : 'saved';
}

function clampControlValue(definition: TransportControlDefinition, value: number): number {
  const clamped = Math.max(definition.min, Math.min(definition.max, Number.isFinite(value) ? value : definition.defaultValue));
  return definition.step === 1 ? Math.round(clamped) : clamped;
}

function pulseActivity(snapshot: VisualizerPulseSnapshot): number {
  return Math.max(
    snapshot.global,
    snapshot.synth,
    snapshot.pad,
    snapshot.lead,
    snapshot.drums,
    snapshot.granular,
    snapshot.earth,
    snapshot.delay,
    snapshot.reverb,
    snapshot.dynamics,
    snapshot.sequencer,
  );
}

function createSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

const RANDOM_FIXED_CONTROLS = new Set<TransportControlDefinition['key']>([
  'medium', 'hybrid', 'motion', 'react', 'sunTaps', 'octaves', 'layers', 'apShape', 'leafTiers',
]);

export function createRandomTransportControls(seed: number): TransportControls {
  const random = mulberry32(seed >>> 0);
  const controls = normalizeTransportControls(TRANSPORT_DEFAULT_CONTROLS);
  for (const definition of TRANSPORT_CONTROL_DEFINITIONS) {
    if (RANDOM_FIXED_CONTROLS.has(definition.key)) continue;
    const minimum = definition.key === 'exposure' ? 1.25
      : definition.key === 'albedo' ? 0.5
      : definition.key === 'skyFill' ? 0.18
      : definition.key === 'waterBrilliance' ? 0.25
      : definition.min;
    const maximum = definition.key === 'contrast' ? 0.75
      : definition.key === 'vignette' ? 0.8
      : definition.max;
    const value = minimum + random() * (maximum - minimum);
    controls[definition.key] = definition.step === 1 ? Math.round(value) : value;
  }
  controls.medium = random() * 2 - 1;
  controls.hybrid = random() * 0.5;
  controls.motion = 0.2 + random() * 0.5;
  controls.react = 0.3 + random() * 0.7;
  controls.apShape = random() < 0.45 ? 1 + Math.floor(random() * 3) : 0;
  if (controls.apShape > 0) controls.apSpill = Math.max(0.12, controls.apSpill);
  return controls;
}

function formatSeed(seed: number): string {
  return `Seed ${Math.abs(Math.floor(seed))}`;
}

const QUALITY_LABELS: Record<VisualizerQualitySettings['effectiveMode'], string> = {
  mobileSafe: 'Mobile Safe',
  desktopBeauty: 'Desktop Beauty',
};

const PERFORMANCE_TIER_LABELS: Record<TransportPerformanceTier, string> = {
  full: 'Full',
  balanced: 'Balanced',
  minimum: 'Minimum',
};

function TransportVisualizerPageInner({
  state,
  isPlaying,
  linkedPresetRequest,
  onVisualizerPresetChange,
  mobileReducedVisuals = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TransportVisualizerRenderer | null>(null);
  const sizeRef = useRef({ width: 960, height: 640 });
  const renderSizeRef = useRef({ width: 0, height: 0, dpr: 0 });
  const controlsRef = useRef<TransportControls>(normalizeTransportControls(TRANSPORT_DEFAULT_CONTROLS));
  const [assignments, setAssignments] = useState<TransportAssignment[]>(createDefaultTransportAssignments);
  const assignmentsRef = useRef<TransportAssignment[]>(assignments);
  const compiledAssignmentsRef = useRef<CompiledTransportAssignments | null>(null);
  const mappedControlsRef = useRef<TransportControls | null>(null);
  const smoothedControlsRef = useRef<TransportControls | null>(null);
  const assignmentSmoothingRef = useRef(createTransportAssignmentSmoothingState());
  const assignmentSignalsRef = useRef<Float32Array | null>(null);
  const triggerCharactersRef = useRef(createTransportTriggerCharacterState());
  if (!compiledAssignmentsRef.current) compiledAssignmentsRef.current = compileTransportAssignments(assignments);
  if (!mappedControlsRef.current) mappedControlsRef.current = normalizeTransportControls(TRANSPORT_DEFAULT_CONTROLS);
  if (!smoothedControlsRef.current) smoothedControlsRef.current = normalizeTransportControls(TRANSPORT_DEFAULT_CONTROLS);
  if (!assignmentSignalsRef.current) assignmentSignalsRef.current = new Float32Array(TRANSPORT_ASSIGNMENT_SOURCES.length * TRANSPORT_ASSIGNMENT_SIGNAL_COUNT);
  const seedRef = useRef(0);
  const stateRef = useRef(state);
  const isPlayingRef = useRef(isPlaying);
  const qualityModeRef = useRef<VisualizerQualityMode>('auto');
  const qualityRef = useRef<VisualizerQualitySettings | null>(null);
  const lastInteractionRef = useRef(0);
  const pulseRiseStateRef = useRef(createTransportPulseRiseState());
  const performanceGovernorRef = useRef(createTransportPerformanceGovernorState());
  const wakeRenderRef = useRef<(interaction?: boolean) => void>(() => undefined);
  const impulseRingRef = useRef(new TransportImpulseRing());
  const impulseFrameRef = useRef<TransportImpulse[]>([]);
  const framePlanInputRef = useRef<TransportFramePlanInput>({
    canAnimate: true,
    isPlaying,
    motion: 0,
    pulseActivity: 0,
    millisecondsSinceInteraction: 0,
    qualityTargetFps: 60,
  });
  const performanceGovernorInputRef = useRef<TransportPerformanceGovernorInput>({
    timeMs: 0,
    isPlaying,
    active: false,
    requestedMode: 'auto',
    effectiveMode: 'desktopBeauty',
    targetFps: 60,
  });
  const frameScratchRef = useRef({
    timeMs: 0,
    width: 960,
    height: 640,
    dpr: 1,
    seed: 0,
    controls: controlsRef.current,
    impulses: impulseFrameRef.current,
    quality: null as unknown as VisualizerQualitySettings,
    performanceTier: 'balanced' as TransportPerformanceTier,
  });

  const [seed, setSeed] = useState(createSeed);
  const [qualityMode, setQualityMode] = useState<VisualizerQualityMode>('auto');
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);
  const [rendererMode, setRendererMode] = useState<'webgl2' | 'canvas2d'>('canvas2d');
  const [frameMode, setFrameMode] = useState<VisualizerFrameMode>('parked');
  const [displayedFps, setDisplayedFps] = useState(0);
  const [performanceTier, setPerformanceTier] = useState<TransportPerformanceTier>('balanced');
  const frameModeRef = useRef<VisualizerFrameMode>('parked');
  const displayedFpsRef = useRef(0);
  const performanceTierRef = useRef<TransportPerformanceTier>('balanced');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const assignmentsOpenRef = useRef(false);
  const [, setAssignmentMeterRevision] = useState(0);
  const assignmentMeterUpdatedAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [presetName, setPresetName] = useState('');
  const [savedPresetList, setSavedPresetList] = useState<PresetSummary[]>([]);
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetLoading, setPresetLoading] = useState<string | null>(null);
  const [presetError, setPresetError] = useState('');
  const presetSaveInFlightRef = useRef(false);
  const presetLoadInFlightRef = useRef(false);
  const [, setControlRevision] = useState(0);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => (
    TRANSPORT_CONTROL_GROUPS.reduce((result, group) => {
      result[group.id] = group.open !== true;
      return result;
    }, {} as Record<string, boolean>)
  ));
  const { canAnimate } = useAnimationVisibility(canvasWrapRef, { rootMargin: '80px' });

  const quality = useMemo(() => resolveVisualizerQualityMode({
    requestedMode: qualityMode,
    isMobileReducedVisuals: mobileReducedVisuals,
    isCoarsePointer: coarsePointer,
    devicePixelRatio,
  }), [coarsePointer, devicePixelRatio, mobileReducedVisuals, qualityMode]);

  seedRef.current = seed;
  stateRef.current = state;
  isPlayingRef.current = isPlaying;
  assignmentsOpenRef.current = assignmentsOpen;
  qualityModeRef.current = qualityMode;
  qualityRef.current = quality;

  useEffect(() => {
    void import('./reactiveVisualizer.css');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let forceCanvas2d = false;
    if (typeof window !== 'undefined') {
      forceCanvas2d = new URLSearchParams(window.location.search).get('visualizerRenderer') === 'canvas2d';
    }
    const renderer = new TransportVisualizerRenderer(canvas, { forceCanvas2d });
    rendererRef.current = renderer;
    setRendererMode(renderer.mode);
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updatePointerAndDpr = () => {
      setDevicePixelRatio(window.devicePixelRatio || 1);
      if (typeof window.matchMedia === 'function') {
        setCoarsePointer(window.matchMedia('(pointer: coarse)').matches);
      }
    };
    const mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null;
    const updatePointer = () => setCoarsePointer(mediaQuery?.matches ?? false);
    updatePointerAndDpr();
    mediaQuery?.addEventListener?.('change', updatePointer);
    window.addEventListener('resize', updatePointerAndDpr);
    return () => {
      mediaQuery?.removeEventListener?.('change', updatePointer);
      window.removeEventListener('resize', updatePointerAndDpr);
    };
  }, []);

  useEffect(() => {
    const target = canvasWrapRef.current;
    if (!target || typeof ResizeObserver !== 'function') return undefined;
    const updateSize = () => {
      const rect = target.getBoundingClientRect();
      sizeRef.current.width = Math.max(320, rect.width || 960);
      sizeRef.current.height = Math.max(260, rect.height || 640);
      wakeRenderRef.current(false);
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(target);
    updateSize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setVisualizerSignalDemand(canAnimate);
    return () => setVisualizerSignalDemand(false);
  }, [canAnimate]);

  useEffect(() => {
    const updateFullscreen = () => {
      const active = document.fullscreenElement === rootRef.current;
      setIsFullscreen(active);
      if (active) setFullscreenFallback(false);
      wakeRenderRef.current(false);
    };
    document.addEventListener('fullscreenchange', updateFullscreen);
    updateFullscreen();
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  useEffect(() => {
    if (!fullscreenFallback) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreenFallback(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreenFallback]);

  useEffect(() => {
    if (!canAnimate) {
      wakeRenderRef.current = () => undefined;
      resetTransportPerformanceGovernor(performanceGovernorRef.current);
      frameModeRef.current = 'parked';
      displayedFpsRef.current = 0;
      setFrameMode('parked');
      setDisplayedFps(0);
      return undefined;
    }

    let frameId: number | null = null;
    let timerId: number | null = null;
    let scheduled = false;

    const publishPlan = (plan: VisualizerFramePlan, active: boolean, timeMs: number) => {
      const nextFps = Math.round(plan.fps);
      if (frameModeRef.current !== plan.mode) {
        frameModeRef.current = plan.mode;
        setFrameMode(plan.mode);
      }
      const governor = performanceGovernorRef.current;
      if (plan.mode === 'active' && active && governor.running) {
        if (shouldPublishTransportFps(governor, timeMs, true)) {
          const measuredFps = markTransportFpsReported(governor, timeMs);
          if (displayedFpsRef.current !== measuredFps) {
            displayedFpsRef.current = measuredFps;
            setDisplayedFps(measuredFps);
          }
        }
      } else if (displayedFpsRef.current !== nextFps) {
        displayedFpsRef.current = nextFps;
        setDisplayedFps(nextFps);
      }
    };

    const scheduleFrame = (delayMs = 0) => {
      if (scheduled) return;
      scheduled = true;
      const request = () => {
        timerId = null;
        frameId = window.requestAnimationFrame(loop);
      };
      if (delayMs > 18) timerId = window.setTimeout(request, Math.max(0, delayMs - 8));
      else request();
    };

    const loop = (timeMs: number) => {
      scheduled = false;
      frameId = null;
      const renderer = rendererRef.current;
      const currentQuality = qualityRef.current;
      if (!renderer || !currentQuality) return;

      const { width, height } = sizeRef.current;
      const dpr = currentQuality.maxDpr;
      const renderSize = renderSizeRef.current;
      if (renderSize.width !== width || renderSize.height !== height || renderSize.dpr !== dpr) {
        renderer.resize(width, height, dpr);
        renderSize.width = width;
        renderSize.height = height;
        renderSize.dpr = dpr;
      }

      const currentPulseActivity = getTransportPulseActivity(pulseRiseStateRef.current, timeMs);
      const active = (Number.isFinite(controlsRef.current.motion) && controlsRef.current.motion > 0)
        || currentPulseActivity >= 0.018;
      const governorInput = performanceGovernorInputRef.current;
      governorInput.timeMs = timeMs;
      governorInput.isPlaying = isPlayingRef.current;
      governorInput.active = active;
      governorInput.requestedMode = qualityModeRef.current;
      governorInput.effectiveMode = currentQuality.effectiveMode;
      governorInput.targetFps = currentQuality.targetFps;
      const tier = updateTransportPerformanceGovernor(performanceGovernorRef.current, governorInput);
      if (performanceTierRef.current !== tier) {
        performanceTierRef.current = tier;
        setPerformanceTier(tier);
      }
      const assignmentSignals = assignmentSignalsRef.current!;
      fillTransportAssignmentSignals(assignmentSignals, timeMs, triggerCharactersRef.current);
      const compiledAssignments = compiledAssignmentsRef.current!;
      let renderControls = controlsRef.current;
      if (compiledAssignments.routeCount > 0) {
        renderControls = evaluateTransportAssignments(
          compiledAssignments,
          controlsRef.current,
          assignmentSignals,
          mappedControlsRef.current!,
        );
      }
      renderControls = smoothTransportAssignmentControls(assignmentSmoothingRef.current,
        controlsRef.current, renderControls, timeMs, smoothedControlsRef.current!);
      impulseRingRef.current.writeTo(impulseFrameRef.current);
      const frame = frameScratchRef.current;
      frame.timeMs = timeMs;
      frame.width = width;
      frame.height = height;
      frame.dpr = dpr;
      frame.seed = seedRef.current;
      frame.controls = renderControls;
      frame.impulses = impulseFrameRef.current;
      frame.quality = currentQuality;
      frame.performanceTier = tier;
      renderer.render(frame as TransportVisualizerFrame);

      const planInput = framePlanInputRef.current;
      planInput.isPlaying = isPlayingRef.current;
      planInput.motion = controlsRef.current.motion;
      planInput.pulseActivity = currentPulseActivity;
      planInput.millisecondsSinceInteraction = Math.max(0, timeMs - lastInteractionRef.current);
      planInput.qualityTargetFps = currentQuality.targetFps;
      const plan = resolveTransportFramePlan(planInput);
      publishPlan(plan, active, timeMs);
      if (assignmentsOpenRef.current && assignmentsRef.current.length > 0
        && plan.mode !== 'parked' && timeMs - assignmentMeterUpdatedAtRef.current >= 250) {
        assignmentMeterUpdatedAtRef.current = timeMs;
        setAssignmentMeterRevision((revision) => revision + 1);
      }
      if (plan.delayMs !== null) scheduleFrame(plan.delayMs);
    };

    wakeRenderRef.current = (interaction = false) => {
      if (interaction) lastInteractionRef.current = performance.now();
      scheduleFrame(0);
    };

    const unsubscribeSignals = subscribeVisualizerSignals(() => {
      const now = performance.now();
      const snapshot = getVisualizerPulseSnapshot(now);
      const rises = updateTransportPulseRiseState(pulseRiseStateRef.current, snapshot, now);
      if (rises === 0) return;
      const reactGain = Math.max(0.35, controlsRef.current.react * 0.5);
      if (rises & TRANSPORT_PULSE_RISE_GRANULAR) {
        queueTransportImpulse(impulseRingRef.current, 'granular', snapshot.granular, snapshot.synthStepPhase, now, seedRef.current, reactGain);
      }
      wakeRenderRef.current(false);
    });
    const unsubscribeInteractionEvents = subscribeProductInteractionEvents((events) => {
      const now = performance.now();
      const reactGain = Math.max(0.35, controlsRef.current.react * 0.5);
      let queued = false;
      for (const event of events) {
        const source = resolveTransportInteractionEventSource(event);
        if (!source) continue;
        const character = resolveTransportRippleCharacter(event, stateRef.current);
        recordTransportTriggerCharacter(triggerCharactersRef.current, source,
          character.strength * character.size, now);
        const phase = ((event.sampleFrame % 65536) / 65536 + 1) % 1;
        queueTransportImpulse(impulseRingRef.current, source, character.strength, phase, now,
            seedRef.current, reactGain, character.size);
        queued = true;
      }
      if (queued) wakeRenderRef.current(false);
    });
    lastInteractionRef.current = performance.now();
    scheduleFrame(0);

    return () => {
      unsubscribeSignals();
      unsubscribeInteractionEvents();
      wakeRenderRef.current = () => undefined;
      if (timerId !== null) window.clearTimeout(timerId);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [canAnimate]);

  const applyControls = useCallback((next: TransportControls, notifyParent: boolean) => {
    Object.assign(controlsRef.current, next);
    setControlRevision((value) => value + 1);
    if (notifyParent) onVisualizerPresetChange('');
    wakeRenderRef.current(true);
  }, [onVisualizerPresetChange]);

  const applyAssignments = useCallback((value: unknown, notifyParent: boolean) => {
    const next = sanitizeTransportAssignments(value);
    assignmentsRef.current = next;
    compiledAssignmentsRef.current = compileTransportAssignments(next);
    setAssignments(next);
    if (notifyParent) onVisualizerPresetChange('');
    wakeRenderRef.current(true);
  }, [onVisualizerPresetChange]);

  const applyTransportPresetData = useCallback((name: string, data: TransportVisualizerPresetData, activeId?: string) => {
    applyControls(data.controls, false);
    applyAssignments(data.assignments, false);
    setQualityMode(data.qualityMode);
    setSeed(data.seed);
    setActivePresetId(activeId ?? name);
    setPresetName(name);
    setPresetError('');
    onVisualizerPresetChange(name);
  }, [applyAssignments, applyControls, onVisualizerPresetChange]);

  const applyBuiltInPreset = useCallback((nameOrId: string): boolean => {
    const preset = resolveTransportPresetRequest(nameOrId);
    const next = preset ? expandTransportPreset(preset) : null;
    if (!preset || !next) return false;
    applyControls(next, false);
    applyAssignments(createDefaultTransportAssignments(), false);
    setActivePresetId(preset.id);
    setPresetName(preset.name);
    setPresetError('');
    onVisualizerPresetChange(preset.name);
    return true;
  }, [applyAssignments, applyControls, onVisualizerPresetChange]);

  useEffect(() => {
    if (!linkedPresetRequest?.name) return undefined;
    const builtIn = applyBuiltInPreset(linkedPresetRequest.name);
    if (builtIn) return undefined;
    let cancelled = false;
    const name = linkedPresetRequest.name;
    presetLoadInFlightRef.current = true;
    setPresetLoading(name);
    setPresetError('');
    void loadTransportVisualizerPreset(name)
      .then((result) => {
        if (cancelled) return;
        if (!result) throw new Error('Only Transport v3 presets can be loaded here.');
        applyTransportPresetData(name, result.data, result.entry.id ?? name);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPresetError(error instanceof Error ? error.message : 'Transport preset could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) {
          presetLoadInFlightRef.current = false;
          setPresetLoading(null);
        }
      });
    return () => {
      cancelled = true;
      presetLoadInFlightRef.current = false;
    };
  }, [applyBuiltInPreset, applyTransportPresetData, linkedPresetRequest]);

  useEffect(() => {
    wakeRenderRef.current(true);
  }, [isPlaying, quality, seed]);

  const updateControl = useCallback((key: TransportControlDefinition['key'], value: number) => {
    const definition = getTransportControlDefinition(key);
    controlsRef.current[key] = clampControlValue(definition, value);
    setActivePresetId(null);
    setControlRevision((revision) => revision + 1);
    onVisualizerPresetChange('');
    wakeRenderRef.current(true);
  }, [onVisualizerPresetChange]);

  const resetControls = useCallback(() => {
    applyControls(normalizeTransportControls(TRANSPORT_DEFAULT_CONTROLS), true);
    applyAssignments(createDefaultTransportAssignments(), false);
    setActivePresetId(null);
    setQualityMode('auto');
    setPresetName('');
    setPresetError('');
  }, [applyAssignments, applyControls]);

  const loadPreset = useCallback((nameOrId: string) => {
    applyBuiltInPreset(nameOrId);
  }, [applyBuiltInPreset]);

  const randomizePreset = useCallback(() => {
    const nextSeed = createSeed();
    applyControls(createRandomTransportControls(nextSeed), true);
    setSeed(nextSeed);
    setActivePresetId('random');
    setPresetName('Random');
    setPresetError('');
  }, [applyControls]);

  const refreshSavedPresets = useCallback(() => {
    void listVisualizerPresets()
      .then((summaries) => setSavedPresetList(filterTransportPresetSummaries(summaries)))
      .catch(() => setPresetError('Saved Transport presets could not be listed.'));
  }, []);

  useEffect(() => {
    refreshSavedPresets();
  }, [refreshSavedPresets]);

  const savePreset = useCallback(async () => {
    const name = presetName.trim();
    if (!name || presetSaveInFlightRef.current) return;
    presetSaveInFlightRef.current = true;
    setPresetSaving(true);
    setPresetError('');
    try {
      const data = createTransportVisualizerPresetData(
        controlsRef.current,
        assignmentsRef.current,
        qualityMode,
        seedRef.current,
      );
      const saved = await saveTransportVisualizerPreset(name, data);
      if (!saved) throw new Error('Transport preset could not be saved.');
      setPresetName(saved.name);
      setActivePresetId(saved.id ?? saved.name);
      onVisualizerPresetChange(saved.name);
      refreshSavedPresets();
    } catch (error: unknown) {
      setPresetError(error instanceof Error ? error.message : 'Transport preset could not be saved.');
    } finally {
      presetSaveInFlightRef.current = false;
      setPresetSaving(false);
    }
  }, [onVisualizerPresetChange, presetName, qualityMode, refreshSavedPresets]);

  const loadSavedPreset = useCallback(async (name: string) => {
    if (presetLoadInFlightRef.current) return;
    presetLoadInFlightRef.current = true;
    setPresetLoading(name);
    setPresetError('');
    try {
      const result = await loadTransportVisualizerPreset(name);
      if (!result) throw new Error('Only Transport v3 presets can be loaded here.');
      applyTransportPresetData(name, result.data, result.entry.id ?? name);
    } catch (error: unknown) {
      setPresetError(error instanceof Error ? error.message : 'Transport preset could not be loaded.');
    } finally {
      presetLoadInFlightRef.current = false;
      setPresetLoading(null);
    }
  }, [applyTransportPresetData]);

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement === root) {
      void document.exitFullscreen();
      return;
    }
    if (fullscreenFallback) {
      setFullscreenFallback(false);
      return;
    }
    if (!root.requestFullscreen) {
      setFullscreenFallback(true);
      return;
    }
    void root.requestFullscreen().catch(() => setFullscreenFallback(true));
  }, [fullscreenFallback]);

  const setQuality = useCallback((mode: VisualizerQualityMode) => {
    setQualityMode(mode);
    setActivePresetId(null);
    onVisualizerPresetChange('');
    wakeRenderRef.current(true);
  }, [onVisualizerPresetChange]);

  const reseedVisualizer = useCallback(() => {
    setSeed(createSeed());
    setActivePresetId(null);
    onVisualizerPresetChange('');
    wakeRenderRef.current(true);
  }, [onVisualizerPresetChange]);

  const updateAssignment = useCallback((id: string, patch: Partial<TransportAssignment>) => {
    const next = assignmentsRef.current.map((assignment) => (
      assignment.id === id ? { ...assignment, ...patch } : assignment
    ));
    setActivePresetId(null);
    applyAssignments(next, true);
  }, [applyAssignments]);

  const deleteAssignment = useCallback((id: string) => {
    const next = assignmentsRef.current.filter((assignment) => assignment.id !== id);
    setActivePresetId(null);
    applyAssignments(next, true);
  }, [applyAssignments]);

  const addAssignment = useCallback(() => {
    if (assignmentsRef.current.length >= TRANSPORT_ASSIGNMENT_MAX_ROUTES) return;
    const next = [
      ...assignmentsRef.current,
      {
        id: 'new-route',
        source: 'global',
        signal: 'level',
        target: 'motion',
        amount: 0.1,
        polarity: 'unipolar' as const,
        enabled: true,
      },
    ];
    setActivePresetId(null);
    applyAssignments(next, true);
  }, [applyAssignments]);

  const formatControlValue = useCallback((definition: TransportControlDefinition, value: number) => {
    if (definition.step === 1) return `${Math.round(value)}`;
    return value.toFixed(Math.abs(value) < 1 ? 3 : 2).replace(/0+$/, '').replace(/\.$/, '');
  }, []);

  const renderControl = useCallback((definition: TransportControlDefinition) => {
    const value = controlsRef.current[definition.key];
    const options = definition.options;
    return (
      <label className={options ? 'visualizer-select-row' : 'visualizer-slider-row'} key={definition.key}>
        <span className="visualizer-slider-label">
          <span>{definition.label}</span>
          <strong>{formatControlValue(definition, value)}</strong>
        </span>
        {options ? (
          <select
            className="visualizer-focus-select"
            value={String(Math.round(value))}
            onChange={(event) => updateControl(definition.key, Number(event.target.value))}
          >
            {options.map((option, index) => <option value={index} key={option}>{option}</option>)}
          </select>
        ) : (
          <input
            type="range"
            min={definition.min}
            max={definition.max}
            step={resolveTransportNativeStep(definition)}
            value={value}
            onChange={(event) => updateControl(definition.key, Number(event.target.value))}
          />
        )}
        {definition.poles && (
          <div className="visualizer-slider-directions">
            <span>{definition.poles[0]}</span><span>↔</span><span>{definition.poles[1]}</span>
          </div>
        )}
      </label>
    );
  }, [formatControlValue, updateControl]);

  const renderAssignment = useCallback((assignment: TransportAssignment) => {
    const value = readTransportAssignmentSignalValue(
      assignmentSignalsRef.current!,
      assignment.source,
      assignment.signal,
    );
    return (
      <div className="visualizer-assignment-row" key={assignment.id}>
        <input
          type="checkbox"
          checked={assignment.enabled}
          aria-label={`${assignment.id} enabled`}
          onChange={(event) => updateAssignment(assignment.id, { enabled: event.target.checked })}
        />
        <select
          value={assignment.source}
          aria-label={`${assignment.id} source`}
          onChange={(event) => updateAssignment(assignment.id, { source: event.target.value as TransportAssignment['source'] })}
        >
          {TRANSPORT_ASSIGNMENT_SOURCES.map((source) => <option value={source} key={source}>{source}</option>)}
        </select>
        <select
          value={assignment.signal}
          aria-label={`${assignment.id} signal`}
          onChange={(event) => updateAssignment(assignment.id, { signal: event.target.value as VisualizerTelemetrySignal })}
        >
          {TRANSPORT_ASSIGNMENT_SIGNALS.map((signal) => <option value={signal} key={signal}>{signal}</option>)}
        </select>
        <select
          value={assignment.target}
          aria-label={`${assignment.id} target`}
          onChange={(event) => updateAssignment(assignment.id, { target: event.target.value as TransportControlDefinition['key'] })}
        >
          {TRANSPORT_CONTROL_DEFINITIONS.filter((definition) => isTransportAssignmentTarget(definition.key)).map((definition) => <option value={definition.key} key={definition.key}>{definition.label}</option>)}
        </select>
        <select
          value={assignment.polarity}
          aria-label={`${assignment.id} polarity`}
          onChange={(event) => updateAssignment(assignment.id, { polarity: event.target.value as TransportAssignmentPolarity })}
        >
          <option value="unipolar">uni</option>
          <option value="bipolar">bi</option>
        </select>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={assignment.amount}
          aria-label={`${assignment.id} amount`}
          onChange={(event) => updateAssignment(assignment.id, { amount: Number(event.target.value) })}
        />
        <span className="visualizer-assignment-amount">{assignment.amount.toFixed(2)}</span>
        <span className="visualizer-assignment-meter" title={`${assignment.source} ${assignment.signal}`}>
          {Math.round(value * 100)}%
        </span>
        <button type="button" onClick={() => deleteAssignment(assignment.id)} aria-label={`Delete ${assignment.id}`}>×</button>
      </div>
    );
  }, [deleteAssignment, updateAssignment]);

  const displayedFpsValue = frameMode === 'parked' ? 0 : displayedFps;
  const className = `visualizer-root${fullscreenFallback ? ' visualizer-root--fullscreen-fallback' : ''}`;

  return (
    <div ref={rootRef} className={className} data-frame-mode={frameMode}>
      <VisualizerCanvasSurface
        canvasRef={canvasRef}
        wrapRef={canvasWrapRef}
        rendererMode={rendererMode}
        isPlaying={isPlaying}
        frameMode={frameMode}
        displayedFps={displayedFpsValue}
        seedLabel={formatSeed(seed)}
      />
      <aside className="visualizer-controls" aria-label="Transport visualizer controls">
        <div className="visualizer-controls-head">
          <div className="visualizer-head-title">
            <h2>Transport</h2>
            <span className="visualizer-mode-label">{QUALITY_LABELS[quality.effectiveMode]} · {PERFORMANCE_TIER_LABELS[performanceTier]}</span>
          </div>
          <div className="visualizer-head-actions">
            <button type="button" onClick={toggleFullscreen} title={isFullscreen || fullscreenFallback ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen || fullscreenFallback ? '⊡' : '⊞'}</button>
            <button type="button" onClick={reseedVisualizer} title="New seed">⟳</button>
            <button type="button" onClick={resetControls} title="Reset all">↺</button>
          </div>
        </div>

        <section className="visualizer-quality-panel" aria-label="Visualizer quality mode">
          <div className="visualizer-panel-header"><h3>Visual Quality</h3><span>{QUALITY_LABELS[quality.effectiveMode]} · {PERFORMANCE_TIER_LABELS[performanceTier]}</span></div>
          <div className="visualizer-quality-options">
            {(['auto', 'mobileSafe', 'desktopBeauty'] as const).map((mode) => (
              <button key={mode} type="button" className={qualityMode === mode ? 'is-active' : undefined} onClick={() => setQuality(mode)}>
                {mode === 'auto' ? 'Auto' : QUALITY_LABELS[mode]}
              </button>
            ))}
          </div>
        </section>

        <section className="visualizer-presets" aria-label="Transport presets">
          <div className="visualizer-preset-save-row">
            <input
              className="visualizer-preset-input"
              value={presetName}
              placeholder="Save Transport preset"
              onChange={(event) => setPresetName(event.target.value)}
              aria-label="Transport preset name"
            />
            <button
              type="button"
              className="visualizer-preset-save-btn"
              disabled={presetSaving || !presetName.trim()}
              onClick={() => { void savePreset(); }}
              title="Save Transport preset"
            >{presetSaving ? '…' : '＋'}</button>
          </div>
          {presetError && <div className="visualizer-preset-error" role="status">{presetError}</div>}
          <div className="visualizer-preset-list">
            {TRANSPORT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`visualizer-preset-chip${preset.id === activePresetId ? ' active' : ''}`}
                onClick={() => loadPreset(preset.id)}
              >
                {preset.name}
              </button>
            ))}
            <button
              type="button"
              className={`visualizer-preset-chip${activePresetId === 'random' ? ' active' : ''}`}
              onClick={randomizePreset}
            >↻ random</button>
          </div>
          {savedPresetList.length > 0 && (
            <div className="visualizer-preset-list" aria-label="Saved Transport presets">
              {savedPresetList.map((preset) => (
                <button
                  key={preset.id ?? preset.name}
                  type="button"
                  className={`visualizer-preset-chip${preset.id === activePresetId ? ' active' : ''}`}
                  disabled={presetLoading !== null}
                  onClick={() => { void loadSavedPreset(preset.name); }}
                >
                  {presetLoading === preset.name ? '…' : preset.name}
                </button>
              ))}
            </div>
          )}
        </section>

        <details className="visualizer-assignments" open={assignmentsOpen}>
          <summary className="visualizer-group-header" onClick={(event) => {
            event.preventDefault();
            setAssignmentsOpen((open) => !open);
          }}>
            <h3>Assignments</h3>
            <span>{assignments.length}/{TRANSPORT_ASSIGNMENT_MAX_ROUTES} {assignmentsOpen ? '▾' : '▸'}</span>
          </summary>
          <div className="visualizer-assignment-list">
            {assignments.map(renderAssignment)}
          </div>
          <button type="button" className="visualizer-assignment-add" disabled={assignments.length >= TRANSPORT_ASSIGNMENT_MAX_ROUTES} onClick={addAssignment}>
            Add assignment
          </button>
        </details>

        <section className="visualizer-control-group" aria-label="Transport master controls">
          <div className="visualizer-group-header"><h3>Transport</h3></div>
          {TRANSPORT_MASTER_CONTROLS.map(renderControl)}
        </section>

        {TRANSPORT_CONTROL_GROUPS.map((group) => {
          const collapsed = collapsedGroups[group.id] ?? false;
          return (
            <section className="visualizer-control-group" key={group.id}>
              <button type="button" className="visualizer-group-header" onClick={() => setCollapsedGroups((current) => ({ ...current, [group.id]: !collapsed }))}>
                <h3>{group.label}</h3><span className="visualizer-group-arrow">{collapsed ? '▸' : '▾'}</span>
              </button>
              {!collapsed && group.controls.map(renderControl)}
            </section>
          );
        })}
      </aside>
    </div>
  );
}

export default function TransportVisualizerPage(props: Props) {
  if (props.enabled === false) return null;
  return <TransportVisualizerPageInner {...props} />;
}
