import { CORE_PRODUCT_SOURCE_IDS, createCoreProductManualNoteEvent, type CoreProductEvent } from './coreProductEvents';
import { createCoreProductHarmonyParamEvents } from './coreProductHarmonyParamEvents';
import {
  PAD_VOICE_COUNT,
  arrangementRestartKey,
  enabledChordMidiForMask,
  enabledVoiceRank,
  padChordVoiceMasksForSource,
  padEuclidOwnedVoiceMask,
} from './coreProductArrangementVoiceMapping';
import { coreProductPadEnvelopeGateSecondsFromState, coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import { createHarmonyState, getEffectiveTension, updateHarmonyState, type HarmonyParams, type HarmonyState } from './harmony';
import { createRng, getUtcBucket } from './rng';
import { getScaleNotesInRange } from './scales';
import { chordIntervalSecondsFromState, resolveChordsPerPhrase } from './chordPhraseTiming';
import {
  getCurrentClockIndexWall,
  getAnchorWallForClockSource,
  getPhraseDurationForClockSource,
  getTimeUntilNextBoundaryWall,
  resolveProgressionPhraseClockSource,
  type TransportAnchors,
  type TransportDebugSnapshot,
} from './transport';
import { harmonySeedMaterialFromState } from './harmonySeedMaterial';
import {
  envelopeAmplitudeAt,
  envelopeForSource,
  midiNoteLabel,
  previewRange,
  type SimpleSequencerPhrasePreview,
  type SimpleSequencerVizNote,
  type SimpleSequencerVizSource,
} from './simpleSequencerPhrasePreview';
import type { PhraseClockSource, SliderState } from '../ui/state';
type PostEvent = (event: CoreProductEvent) => void;
type PublishTrigger = (name: string, ...payload: unknown[]) => void;
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function numberFromState(state: Record<string, unknown>, key: string, fallback: number): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function boundedNumber(state: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  return clamp(numberFromState(state, key, fallback), min, max);
}
function boundedInteger(state: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  return clamp(Math.round(numberFromState(state, key, fallback)), min, max);
}
function booleanFromState(state: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = state[key];
  return typeof value === 'boolean' ? value : fallback;
}
function sliderStateFromRecord(state: Record<string, unknown>): SliderState {
  return state as unknown as SliderState;
}
function harmonyChordIntervalSeconds(state: SliderState): number {
  const phraseLength = harmonyPhraseSeconds(state);
  return chordIntervalSecondsFromState(state.chordRate, phraseLength);
}
function padChordTriggerIntervalSeconds(state: SliderState): number {
  return harmonyChordIntervalSeconds(state);
}
function harmonyParamsFromState(state: SliderState): Partial<HarmonyParams> {
  return {
    cofDriftEnabled: state.cofDriftEnabled ?? false,
    cofDriftRate: state.cofDriftRate ?? 2,
    cofDriftDirection: state.cofDriftDirection ?? 'cw',
    cofDriftRange: state.cofDriftRange ?? 3,
    chordProgressionEnabled: state.chordProgressionEnabled ?? false,
    chordProgressionPattern: state.chordProgressionPattern ?? [0, 3, 4, 0],
    chordProgressionSteps: state.chordProgressionSteps ?? 4,
    chordProgressionStepEnabled: state.chordProgressionStepEnabled ?? [true, true, true, true],
    chordProgressionPhraseMultiplier: state.chordProgressionPhraseMultiplier ?? 1,
  };
}

function harmonyPhraseSeconds(state: SliderState): number {
  return getPhraseDurationForClockSource(state, state.harmonyClockSource ?? 'globalPhrase');
}

function progressionPhraseSeconds(state: SliderState): number {
  const source = resolveProgressionPhraseClockSource(
    state.chordProgressionClockSource ?? 'harmony',
    state.harmonyClockSource ?? 'globalPhrase',
  );
  return getPhraseDurationForClockSource(state, source);
}

function createSchedulerHarmonyState(state: SliderState): HarmonyState {
  return createHarmonyState(
    harmonySeedMaterialFromState(state),
    state.tension ?? 0.3,
    harmonyChordIntervalSeconds(state),
    state.voicingSpread ?? 0.5,
    state.detune ?? 8,
    state.scaleMode === 'manual' ? 'manual' : 'auto',
    typeof state.manualScale === 'string' ? state.manualScale : 'Major (Ionian)',
    state.rootNote ?? 4,
    harmonyPhraseSeconds(state),
    harmonyParamsFromState(state),
  );
}

function pickChordWeightedNote(
  rng: () => number,
  availableNotes: number[],
  chordMidiNotes: number[] | undefined,
  chordBias: number,
): number {
  if (availableNotes.length === 0) return 60;
  if (!chordMidiNotes || chordMidiNotes.length === 0 || availableNotes.length <= 1) {
    return availableNotes[Math.floor(rng() * availableNotes.length)] ?? availableNotes[0] ?? 60;
  }
  const chordPitchClasses = new Set(chordMidiNotes.map((note) => ((note % 12) + 12) % 12));
  const chordTones = availableNotes.filter((note) => chordPitchClasses.has(((note % 12) + 12) % 12));
  const passingTones = availableNotes.filter((note) => !chordPitchClasses.has(((note % 12) + 12) % 12));
  if (chordTones.length === 0) {
    return availableNotes[Math.floor(rng() * availableNotes.length)] ?? availableNotes[0] ?? 60;
  }
  if (passingTones.length === 0 || rng() < chordBias) {
    return chordTones[Math.floor(rng() * chordTones.length)] ?? chordTones[0] ?? 60;
  }
  return passingTones[Math.floor(rng() * passingTones.length)] ?? availableNotes[0] ?? 60;
}

function leadRandomSource(state: Record<string, unknown>): 'lead1' | 'lead2' | 'piano' {
  const source = state.leadRandomSource;
  return source === 'lead2' || source === 'piano' ? source : 'lead1';
}

function leadRandomSourceId(source: 'lead1' | 'lead2' | 'piano'): number {
  if (source === 'lead2') return CORE_PRODUCT_SOURCE_IDS.lead2;
  if (source === 'piano') return CORE_PRODUCT_SOURCE_IDS.piano;
  return CORE_PRODUCT_SOURCE_IDS.lead1;
}

function runtimeSourceFromSourceId(sourceId: number): SimpleSequencerVizSource {
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.pad2) return 'pad2';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.lead1) return 'lead1';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.lead2) return 'lead2';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.piano) return 'piano';
  return 'pad1';
}

type PhraseTiming = {
  phraseIndex: number;
  phraseStartWallSec: number;
};

function phraseTimingForClockSource(
  clockSource: PhraseClockSource,
  phraseSeconds: number,
  anchors: TransportAnchors,
  nowWallSec: number,
): PhraseTiming {
  const safePhraseSeconds = Math.max(0.001, phraseSeconds);
  const phraseIndex = getCurrentClockIndexWall(clockSource, safePhraseSeconds, anchors, nowWallSec);
  const phraseStartWallSec = getAnchorWallForClockSource(clockSource, anchors) + phraseIndex * safePhraseSeconds;
  return {
    phraseIndex,
    phraseStartWallSec,
  };
}

function runtimePlanKey(plan: SimpleSequencerPhrasePreview): string {
  const noteKey = plan.notes
    .map((note) => `${note.id}:${note.source}:${Math.round(note.midi)}:${(note.triggerWallSec ?? note.triggerSeconds).toFixed(4)}:${note.velocity.toFixed(3)}`)
    .join('|');
  return `${plan.kind}:runtime:${plan.enabled ? 'on' : 'off'}:${plan.phraseIndex ?? 0}:${(plan.phraseStartWallSec ?? 0).toFixed(4)}:${plan.phraseSeconds.toFixed(4)}:${plan.triggerIntervalSeconds.toFixed(4)}:${noteKey}`;
}

function cloneRuntimePlan(plan: SimpleSequencerPhrasePreview | null): SimpleSequencerPhrasePreview | null {
  if (!plan) return null;
  return {
    ...plan,
    notes: plan.notes.map((note) => ({ ...note, envelope: { ...note.envelope } })),
  };
}

const RUNTIME_NOTE_FLOOR = 0.0008;

function sourceDistanceValue(state: Record<string, unknown>, key: string): number {
  return boundedNumber(state, key, 0, 0, 1);
}

function leadRandomSourceEnabled(state: Record<string, unknown>, source: 'lead1' | 'lead2' | 'piano'): boolean {
  if (!booleanFromState(state, 'leadRandomEnabled', false)) return false;
  if (source === 'lead2') return booleanFromState(state, 'lead2Enabled', false);
  if (source === 'piano') return booleanFromState(state, 'pianoEnabled', false);
  return booleanFromState(state, 'leadEnabled', false);
}

function manualNoteSourceEnabled(state: Record<string, unknown>, sourceId: number): boolean {
  switch (sourceId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
      return booleanFromState(state, 'padEnabled', false);
    case CORE_PRODUCT_SOURCE_IDS.pad2:
      return booleanFromState(state, 'pad2Enabled', false);
    case CORE_PRODUCT_SOURCE_IDS.lead1:
      return booleanFromState(state, 'leadEnabled', false);
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      return booleanFromState(state, 'lead2Enabled', false);
    case CORE_PRODUCT_SOURCE_IDS.piano:
      return booleanFromState(state, 'pianoEnabled', false);
    case CORE_PRODUCT_SOURCE_IDS.drum:
      return booleanFromState(state, 'drumEnabled', false);
    default:
      return true;
  }
}

function padChordHasEnabledTarget(state: Record<string, unknown>): boolean {
  if (!booleanFromState(state, 'synthChordSequencerEnabled', false)) return false;
  const source = String(state.synthChordSequencerSource ?? 'both').trim().toLowerCase();
  if (source === 'lead1' || source === 'lead') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.lead1);
  if (source === 'lead2') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.lead2);
  if (source === 'piano') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.piano);
  if (source === 'pad1' || source === 'pad') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad1);
  if (source === 'pad2') return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad2);
  return manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad1) ||
    manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad2);
}

export class CoreProductArrangementScheduler {
  private state: Record<string, unknown> | null = null;
  private phraseState: Record<string, unknown> | null = null;
  private anchors: TransportAnchors | null = null;
  private harmonyState: HarmonyState | null = null;
  private rng: (() => number) | null = null;
  private running = false;
  private chordSubTickCount = 0;
  private harmonyTimer: number | null = null;
  private leadPhraseTimer: number | null = null;
  private readonly padNoteTimers = new Set<number>();
  private readonly leadNoteTimers = new Set<number>();
  private padChordPlan: SimpleSequencerPhrasePreview | null = null;
  private previousPadChordPlan: SimpleSequencerPhrasePreview | null = null;
  private randomTimingPlan: SimpleSequencerPhrasePreview | null = null;
  private previousRandomTimingPlan: SimpleSequencerPhrasePreview | null = null;
  private restartKey = '';

  constructor(
    private readonly postEvent: PostEvent,
    private readonly getContext: () => AudioContext | null,
    private readonly publishTrigger?: PublishTrigger,
  ) {}

  start(state: Record<string, unknown> | null | undefined): void {
    this.stop();
    if (!state) return;
    this.restartKey = arrangementRestartKey(state);
    this.state = { ...state };
    this.phraseState = { ...state };
    this.running = true;
    const sliderState = sliderStateFromRecord(this.state);
    const nowWallSec = Date.now() / 1000;
    this.anchors = {
      localPhraseWallStartSec: nowWallSec,
      localBeatWallStartSec: nowWallSec,
      localBeatCtxStartSec: this.getContext()?.currentTime ?? 0,
    };
    const bucket = getUtcBucket(sliderState.seedWindow === 'day' ? 'day' : 'hour');
    this.rng = createRng(`${bucket}|E_ROOT`);
    this.harmonyState = createSchedulerHarmonyState(sliderState);
    for (const event of createCoreProductHarmonyParamEvents(this.harmonyState)) this.postEvent(event);
    if (booleanFromState(this.state, 'synthChordSequencerEnabled', false)) {
      this.triggerPadChord();
    }
    this.scheduleHarmonyTicks();
    if (booleanFromState(this.state, 'leadRandomEnabled', false)) {
      this.startLeadMelody((sliderState.leadRandomSyncPolicy ?? 'nextPhrase') === 'nextPhrase');
    }
  }

  update(state: Record<string, unknown> | null | undefined): void {
    if (!this.running) {
      this.state = state ? { ...state } : null;
      this.phraseState = this.state ? { ...this.state } : null;
      this.restartKey = this.state ? arrangementRestartKey(this.state) : '';
      return;
    }
    if (!state) {
      this.stop();
      this.state = null;
      this.phraseState = null;
      this.restartKey = '';
      return;
    }
    const nextRestartKey = arrangementRestartKey(state);
    if (nextRestartKey !== this.restartKey) {
      this.start(state);
      return;
    }
    this.state = { ...state };
    if (!padChordHasEnabledTarget(this.state)) {
      this.clearPadNoteTimers();
      this.padChordPlan = null;
      this.previousPadChordPlan = null;
    }
    const randomSource = leadRandomSource(this.state);
    if (!leadRandomSourceEnabled(this.state, randomSource)) {
      this.clearLeadNoteTimers();
      this.randomTimingPlan = null;
      this.previousRandomTimingPlan = null;
    }
  }

  stop(): void {
    this.running = false;
    this.clearTimer('harmonyTimer');
    this.clearTimer('leadPhraseTimer');
    for (const timer of this.padNoteTimers) {
      window.clearTimeout(timer);
    }
    for (const timer of this.leadNoteTimers) {
      window.clearTimeout(timer);
    }
    this.padNoteTimers.clear();
    this.leadNoteTimers.clear();
    this.chordSubTickCount = 0;
    this.padChordPlan = null;
    this.previousPadChordPlan = null;
    this.randomTimingPlan = null;
    this.previousRandomTimingPlan = null;
    this.restartKey = '';
    this.phraseState = null;
  }

  private clearPadNoteTimers(): void {
    for (const timer of this.padNoteTimers) {
      window.clearTimeout(timer);
    }
    this.padNoteTimers.clear();
  }

  private clearLeadNoteTimers(): void {
    for (const timer of this.leadNoteTimers) {
      window.clearTimeout(timer);
    }
    this.leadNoteTimers.clear();
  }

  getTransportDebugState(nowWallSec: number = Date.now() / 1000): Partial<TransportDebugSnapshot> | null {
    if (!this.running || !this.state || !this.anchors) return null;
    const phraseState = this.getPhraseState() ?? this.state;
    const padSliderState = sliderStateFromRecord(phraseState);
    const padClockSource = padSliderState.harmonyClockSource ?? 'globalPhrase';
    const padPhraseSeconds = harmonyPhraseSeconds(padSliderState);
    const liveSliderState = sliderStateFromRecord(this.state);
    const randomClockSource = liveSliderState.leadRandomClockSource ?? 'globalPhrase';
    const randomPhraseSeconds = getPhraseDurationForClockSource(liveSliderState, randomClockSource);
    return {
      padChordPhraseSeconds: padPhraseSeconds,
      nextPadChordBoundaryIn: getTimeUntilNextBoundaryWall(
        padClockSource,
        padPhraseSeconds,
        this.anchors,
        nowWallSec,
      ),
      padChordPlan: cloneRuntimePlan(this.padChordPlan),
      previousPadChordPlan: cloneRuntimePlan(this.previousPadChordPlan),
      randomTimingPhraseSeconds: randomPhraseSeconds,
      nextRandomTimingBoundaryIn: getTimeUntilNextBoundaryWall(
        randomClockSource,
        randomPhraseSeconds,
        this.anchors,
        nowWallSec,
      ),
      randomTimingPlan: cloneRuntimePlan(this.randomTimingPlan),
      previousRandomTimingPlan: cloneRuntimePlan(this.previousRandomTimingPlan),
    };
  }

  private getPhraseState(): Record<string, unknown> | null {
    return this.phraseState ?? this.state;
  }

  private capturePhraseState(): Record<string, unknown> | null {
    if (!this.state) return null;
    this.phraseState = { ...this.state };
    return this.phraseState;
  }

  private createRuntimePlan(
    kind: 'padChord' | 'randomTiming',
    enabled: boolean,
    phraseSeconds: number,
    triggerIntervalSeconds: number,
    phraseIndex: number,
    phraseStartWallSec: number,
    rangeMinMidi?: number,
    rangeMaxMidi?: number,
  ): SimpleSequencerPhrasePreview {
    const range = previewRange([], rangeMinMidi, rangeMaxMidi);
    const plan: SimpleSequencerPhrasePreview = {
      kind,
      enabled,
      phraseSeconds,
      triggerIntervalSeconds,
      notes: [],
      ...range,
      ...(rangeMinMidi != null ? { rangeMinMidi } : {}),
      ...(rangeMaxMidi != null ? { rangeMaxMidi } : {}),
      phraseIndex,
      phraseStartWallSec,
      key: '',
    };
    return { ...plan, key: runtimePlanKey(plan) };
  }

  private updateRuntimePlanNotes(
    plan: SimpleSequencerPhrasePreview,
    notes: readonly SimpleSequencerVizNote[],
    rangeMinMidi = plan.rangeMinMidi,
    rangeMaxMidi = plan.rangeMaxMidi,
  ): SimpleSequencerPhrasePreview {
    const sortedNotes = [...notes].sort((left, right) => {
      const leftTime = left.triggerWallSec ?? left.triggerSeconds;
      const rightTime = right.triggerWallSec ?? right.triggerSeconds;
      return leftTime - rightTime || left.midi - right.midi || String(left.id).localeCompare(String(right.id));
    });
    const range = previewRange(sortedNotes, rangeMinMidi, rangeMaxMidi);
    const nextPlan: SimpleSequencerPhrasePreview = {
      ...plan,
      notes: sortedNotes,
      ...range,
      ...(rangeMinMidi != null ? { rangeMinMidi } : {}),
      ...(rangeMaxMidi != null ? { rangeMaxMidi } : {}),
    };
    return { ...nextPlan, key: runtimePlanKey(nextPlan) };
  }

  private createCarryoverPlan(
    kind: 'padChord' | 'randomTiming',
    previousPlan: SimpleSequencerPhrasePreview | null,
    currentPlan: SimpleSequencerPhrasePreview | null,
    phraseSeconds: number,
    triggerIntervalSeconds: number,
    phraseIndex: number,
    phraseStartWallSec: number,
    rangeMinMidi?: number,
    rangeMaxMidi?: number,
  ): SimpleSequencerPhrasePreview | null {
    const notesByKey = new Map<string, SimpleSequencerVizNote>();
    for (const plan of [previousPlan, currentPlan]) {
      if (!plan) continue;
      for (const note of plan.notes) {
        const triggerWallSec = note.triggerWallSec ?? (plan.phraseStartWallSec != null ? plan.phraseStartWallSec + note.triggerSeconds : null);
        if (triggerWallSec == null || !Number.isFinite(triggerWallSec)) continue;
        const ageAtPhraseStart = phraseStartWallSec - triggerWallSec;
        if (ageAtPhraseStart >= 0 && envelopeAmplitudeAt(ageAtPhraseStart, note.envelope) <= RUNTIME_NOTE_FLOOR) continue;
        notesByKey.set(`${note.id}:${triggerWallSec.toFixed(4)}`, {
          ...note,
          triggerSeconds: triggerWallSec - phraseStartWallSec,
          triggerWallSec,
        });
      }
    }
    const notes = [...notesByKey.values()];
    if (notes.length === 0) return null;
    return this.updateRuntimePlanNotes(
      this.createRuntimePlan(kind, true, phraseSeconds, triggerIntervalSeconds, phraseIndex, phraseStartWallSec, rangeMinMidi, rangeMaxMidi),
      notes,
      rangeMinMidi,
      rangeMaxMidi,
    );
  }

  private ensurePadChordPlan(
    phraseSeconds: number,
    triggerIntervalSeconds: number,
    phraseIndex: number,
    phraseStartWallSec: number,
  ): SimpleSequencerPhrasePreview {
    if (
      this.padChordPlan &&
      this.padChordPlan.phraseIndex === phraseIndex &&
      Math.abs((this.padChordPlan.phraseStartWallSec ?? 0) - phraseStartWallSec) < 0.001 &&
      Math.abs(this.padChordPlan.phraseSeconds - phraseSeconds) < 0.001 &&
      Math.abs(this.padChordPlan.triggerIntervalSeconds - triggerIntervalSeconds) < 0.001
    ) {
      return this.padChordPlan;
    }
    this.previousPadChordPlan = this.createCarryoverPlan(
      'padChord',
      this.previousPadChordPlan,
      this.padChordPlan,
      phraseSeconds,
      triggerIntervalSeconds,
      phraseIndex,
      phraseStartWallSec,
    );
    this.padChordPlan = this.createRuntimePlan('padChord', true, phraseSeconds, triggerIntervalSeconds, phraseIndex, phraseStartWallSec);
    return this.padChordPlan;
  }

  private appendPadChordPlanNotes(notes: readonly SimpleSequencerVizNote[]): void {
    if (!this.padChordPlan || notes.length === 0) return;
    this.padChordPlan = this.updateRuntimePlanNotes(this.padChordPlan, [...this.padChordPlan.notes, ...notes]);
  }

  private ensureRandomTimingPlan(
    phraseSeconds: number,
    phraseIndex: number,
    phraseStartWallSec: number,
    rangeMinMidi: number,
    rangeMaxMidi: number,
  ): SimpleSequencerPhrasePreview {
    if (
      this.randomTimingPlan &&
      this.randomTimingPlan.phraseIndex === phraseIndex &&
      Math.abs((this.randomTimingPlan.phraseStartWallSec ?? 0) - phraseStartWallSec) < 0.001 &&
      Math.abs(this.randomTimingPlan.phraseSeconds - phraseSeconds) < 0.001 &&
      this.randomTimingPlan.rangeMinMidi === rangeMinMidi &&
      this.randomTimingPlan.rangeMaxMidi === rangeMaxMidi
    ) {
      return this.randomTimingPlan;
    }
    this.previousRandomTimingPlan = this.createCarryoverPlan(
      'randomTiming',
      this.previousRandomTimingPlan,
      this.randomTimingPlan,
      phraseSeconds,
      phraseSeconds,
      phraseIndex,
      phraseStartWallSec,
      rangeMinMidi,
      rangeMaxMidi,
    );
    this.randomTimingPlan = this.createRuntimePlan('randomTiming', true, phraseSeconds, phraseSeconds, phraseIndex, phraseStartWallSec, rangeMinMidi, rangeMaxMidi);
    return this.randomTimingPlan;
  }

  private setRandomTimingPlanNotes(notes: readonly SimpleSequencerVizNote[], rangeMinMidi: number, rangeMaxMidi: number): void {
    if (!this.randomTimingPlan) return;
    this.randomTimingPlan = this.updateRuntimePlanNotes(this.randomTimingPlan, notes, rangeMinMidi, rangeMaxMidi);
  }

  private clearTimer(key: 'harmonyTimer' | 'leadPhraseTimer'): void {
    const timer = this[key];
    if (timer !== null) {
      window.clearTimeout(timer);
      this[key] = null;
    }
  }
  private scheduleNote(delaySeconds: number, event: CoreProductEvent, owner: 'pad' | 'lead'): void {
    const post = () => {
      const targetId = event.targetId;
      if (!this.state || typeof targetId !== 'number' || !manualNoteSourceEnabled(this.state, targetId)) return;
      this.postEvent(event);
      this.publishManualNoteTrigger(event);
    };
    const delayMs = Math.max(0, delaySeconds * 1000);
    if (delayMs <= 1) {
      post();
      return;
    }
    const timers = owner === 'pad' ? this.padNoteTimers : this.leadNoteTimers;
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      if (this.running) post();
    }, delayMs);
    timers.add(timer);
  }

  private publishManualNoteTrigger(event: CoreProductEvent): void {
    if (!this.publishTrigger || !this.state) return;
    switch (event.targetId) {
      case CORE_PRODUCT_SOURCE_IDS.pad1:
        this.publishTrigger('padDistance', sourceDistanceValue(this.state, 'padDistance'));
        break;
      case CORE_PRODUCT_SOURCE_IDS.pad2:
        this.publishTrigger('pad2Distance', sourceDistanceValue(this.state, 'pad2Distance'));
        break;
      case CORE_PRODUCT_SOURCE_IDS.lead1:
        this.publishTrigger('leadDistance', { lead1: sourceDistanceValue(this.state, 'lead1Distance'), lead2: -1 });
        break;
      case CORE_PRODUCT_SOURCE_IDS.lead2:
        this.publishTrigger('leadDistance', { lead1: -1, lead2: sourceDistanceValue(this.state, 'lead2Distance') });
        break;
      case CORE_PRODUCT_SOURCE_IDS.piano:
        this.publishTrigger('pianoDistance', sourceDistanceValue(this.state, 'pianoDistance'));
        break;
      default:
        break;
    }
  }

  private scheduleHarmonyTicks(): void {
    if (!this.running || !this.state || !this.anchors) return;
    this.clearTimer('harmonyTimer');
    this.chordSubTickCount = 0;
    const phraseState = this.getPhraseState();
    if (!phraseState) return;
    const sliderState = sliderStateFromRecord(phraseState);
    const phraseLength = harmonyPhraseSeconds(sliderState);
    const clockSource = sliderState.harmonyClockSource ?? 'globalPhrase';
    const delaySeconds = getTimeUntilNextBoundaryWall(clockSource, phraseLength, this.anchors);
    this.harmonyTimer = window.setTimeout(() => {
      this.chordSubTickCount = 0;
      this.onHarmonyTick(true);
      this.scheduleNextHarmonyTick();
    }, delaySeconds * 1000);
  }

  private scheduleNextHarmonyTick(): void {
    if (!this.running || !this.state || !this.anchors) return;
    const phraseState = this.getPhraseState();
    if (!phraseState) return;
    const sliderState = sliderStateFromRecord(phraseState);
    const phraseLength = harmonyPhraseSeconds(sliderState);
    const chordsPerPhrase = resolveChordsPerPhrase(sliderState.chordRate, phraseLength);
    const clockSource = sliderState.harmonyClockSource ?? 'globalPhrase';
    if (chordsPerPhrase > 1) {
      const subInterval = phraseLength / chordsPerPhrase;
      this.harmonyTimer = window.setTimeout(() => {
        this.chordSubTickCount += 1;
        const isPhraseBoundary = this.chordSubTickCount >= chordsPerPhrase;
        if (isPhraseBoundary) this.chordSubTickCount = 0;
        this.onHarmonyTick(isPhraseBoundary);
        this.scheduleNextHarmonyTick();
      }, subInterval * 1000);
      return;
    }
    const delaySeconds = getTimeUntilNextBoundaryWall(clockSource, phraseLength, this.anchors);
    this.harmonyTimer = window.setTimeout(() => {
      this.onHarmonyTick(true);
      this.scheduleNextHarmonyTick();
    }, delaySeconds * 1000);
  }

  private onHarmonyTick(isPhraseBoundary: boolean): void {
    if (!this.state || !this.harmonyState || !this.anchors) return;
    const phraseState = isPhraseBoundary ? this.capturePhraseState() : this.getPhraseState();
    if (!phraseState) return;
    const sliderState = sliderStateFromRecord(phraseState);
    const phraseLength = harmonyPhraseSeconds(sliderState);
    const nowWallSec = Date.now() / 1000;
    const phraseIndex = getCurrentClockIndexWall(
      sliderState.harmonyClockSource ?? 'globalPhrase',
      phraseLength,
      this.anchors,
      nowWallSec,
    );
    const progressionPhraseIndex = getCurrentClockIndexWall(
      resolveProgressionPhraseClockSource(
        sliderState.chordProgressionClockSource ?? 'harmony',
        sliderState.harmonyClockSource ?? 'globalPhrase',
      ),
      progressionPhraseSeconds(sliderState),
      this.anchors,
      nowWallSec,
    );
    this.harmonyState = updateHarmonyState(
      this.harmonyState,
      harmonySeedMaterialFromState(sliderState),
      phraseIndex,
      sliderState.tension ?? 0.3,
      harmonyChordIntervalSeconds(sliderState),
      sliderState.voicingSpread ?? 0.5,
      sliderState.detune ?? 8,
      sliderState.scaleMode === 'manual' ? 'manual' : 'auto',
      typeof sliderState.manualScale === 'string' ? sliderState.manualScale : 'Major (Ionian)',
      sliderState.rootNote ?? 4,
      phraseLength,
      harmonyParamsFromState(sliderState),
      progressionPhraseIndex,
      isPhraseBoundary,
    );
    if (isPhraseBoundary) for (const event of createCoreProductHarmonyParamEvents(this.harmonyState)) this.postEvent(event);
    if (booleanFromState(this.state, 'synthChordSequencerEnabled', false)) {
      this.triggerPadChord();
    }
  }

  private triggerPadChord(): void {
    if (!this.state || !this.harmonyState || !this.rng) return;
    const state = this.getPhraseState();
    if (!state) return;
    const maskLimit = (1 << PAD_VOICE_COUNT) - 1;
    const source = String(state.synthChordSequencerSource ?? 'both').trim().toLowerCase();
    const voiceCount = boundedInteger(state, 'synthChordSequencerVoiceCount', 6, 1, PAD_VOICE_COUNT);
    const euclidOwnedMask = padEuclidOwnedVoiceMask(state);
    const rawVoiceMask = boundedInteger(state, 'synthVoiceMask', 63, 0, maskLimit) & maskLimit;
    const pad2Assign = boundedInteger(state, 'pad2VoiceAssign', 0, 0, maskLimit) & maskLimit;
    const availablePadMask = rawVoiceMask & ~euclidOwnedMask;
    const chordMidi = this.harmonyState.currentChord.midiNotes.length > 0
      ? this.harmonyState.currentChord.midiNotes
      : [48 + boundedInteger(state, 'rootNote', 4, 0, 11)];
    const octaveShift = boundedInteger(state, 'synthOctave', 0, -2, 2) * 12;
    const sliderState = sliderStateFromRecord(state);
    const phraseSeconds = harmonyPhraseSeconds(sliderState);
    const triggerIntervalSeconds = padChordTriggerIntervalSeconds(sliderState);
    const nowWallSec = Date.now() / 1000;
    const timing = this.anchors
      ? phraseTimingForClockSource(sliderState.harmonyClockSource ?? 'globalPhrase', phraseSeconds, this.anchors, nowWallSec)
      : null;
    if (timing) {
      this.ensurePadChordPlan(phraseSeconds, triggerIntervalSeconds, timing.phraseIndex, timing.phraseStartWallSec);
    }
    const runtimeNotes: SimpleSequencerVizNote[] = [];
    const addRuntimeNote = (
      sourceId: number,
      midi: number,
      delaySeconds: number,
      voiceIndex: number,
      velocity = 1,
    ) => {
      if (!timing) return;
      const vizSource = runtimeSourceFromSourceId(sourceId);
      const triggerWallSec = nowWallSec + delaySeconds;
      runtimeNotes.push({
        id: `pad-runtime:${timing.phraseIndex}:${triggerWallSec.toFixed(4)}:${vizSource}:${voiceIndex}:${Math.round(midi)}:${runtimeNotes.length}`,
        source: vizSource,
        midi,
        label: midiNoteLabel(midi),
        voiceIndex,
        triggerSeconds: triggerWallSec - timing.phraseStartWallSec,
        triggerWallSec,
        velocity,
        envelope: envelopeForSource(sliderState, vizSource, delaySeconds, triggerIntervalSeconds),
      });
    };
    const waveSpreadSeconds =
      boundedNumber(state, 'waveSpread', 0.125, 0, 1) *
      triggerIntervalSeconds;
    const voiceOffsets = Array.from({ length: PAD_VOICE_COUNT }, () => this.rng!() * waveSpreadSeconds).sort((a, b) => a - b);

    const nonPadSourceId = source === 'lead1' || source === 'lead'
      ? CORE_PRODUCT_SOURCE_IDS.lead1
      : source === 'lead2'
        ? CORE_PRODUCT_SOURCE_IDS.lead2
        : source === 'piano'
          ? CORE_PRODUCT_SOURCE_IDS.piano
          : 0;
    if (nonPadSourceId !== 0) {
      if (!manualNoteSourceEnabled(state, nonPadSourceId)) return;
      for (let index = 0; index < voiceCount; index += 1) {
        const midi = clamp(chordMidi[index % chordMidi.length]! + octaveShift, 0, 127);
        const holdSeconds = coreProductSynthSequencerHoldSecondsFromState(state, nonPadSourceId, 0.5);
        const delaySeconds = voiceOffsets[index] ?? 0;
        addRuntimeNote(nonPadSourceId, midi, delaySeconds, index);
        this.scheduleNote(voiceOffsets[index] ?? 0, createCoreProductManualNoteEvent(
          nonPadSourceId,
          midi,
          1,
          holdSeconds * 1000,
        ), 'pad');
      }
      this.appendPadChordPlanNotes(runtimeNotes);
      return;
    }

    const rawPadMasks = padChordVoiceMasksForSource(source, availablePadMask, pad2Assign, voiceCount);
    const pad1Mask = manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad1) ? rawPadMasks.pad1Mask : 0;
    const pad2Mask = manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad2) ? rawPadMasks.pad2Mask : 0;
    if ((pad1Mask | pad2Mask) === 0) return;
    const pad1ChordMidi = enabledChordMidiForMask(chordMidi, pad1Mask);
    const pad2ChordMidi = enabledChordMidiForMask(chordMidi, pad2Mask);
    for (let voiceIndex = 0; voiceIndex < PAD_VOICE_COUNT; voiceIndex += 1) {
      const bit = 1 << voiceIndex;
      const delaySeconds = voiceOffsets[voiceIndex] ?? 0;
      if ((pad1Mask & bit) !== 0) {
        const enabledIndex = enabledVoiceRank(pad1Mask, voiceIndex);
        const midi = clamp(pad1ChordMidi[enabledIndex % pad1ChordMidi.length]! + octaveShift, 0, 127);
        const holdSeconds = coreProductPadEnvelopeGateSecondsFromState(state, 'pad1', {
          triggerIntervalSeconds,
          voiceDelaySeconds: delaySeconds,
        });
        addRuntimeNote(CORE_PRODUCT_SOURCE_IDS.pad1, midi, delaySeconds, voiceIndex);
        this.scheduleNote(delaySeconds, createCoreProductManualNoteEvent(
          CORE_PRODUCT_SOURCE_IDS.pad1,
          midi,
          1,
          holdSeconds * 1000,
          voiceIndex,
        ), 'pad');
      }
      if ((pad2Mask & bit) !== 0) {
        const enabledIndex = enabledVoiceRank(pad2Mask, voiceIndex);
        const midi = clamp(pad2ChordMidi[enabledIndex % pad2ChordMidi.length]! + octaveShift, 0, 127);
        const holdSeconds = coreProductPadEnvelopeGateSecondsFromState(state, 'pad2', {
          triggerIntervalSeconds,
          voiceDelaySeconds: delaySeconds,
        });
        addRuntimeNote(CORE_PRODUCT_SOURCE_IDS.pad2, midi, delaySeconds, voiceIndex);
        this.scheduleNote(delaySeconds, createCoreProductManualNoteEvent(
          CORE_PRODUCT_SOURCE_IDS.pad2,
          midi,
          1,
          holdSeconds * 1000,
          voiceIndex,
        ), 'pad');
      }
    }
    this.appendPadChordPlanNotes(runtimeNotes);
  }

  private startLeadMelody(deferToBoundary: boolean): void {
    this.clearTimer('leadPhraseTimer');
    for (const timer of this.leadNoteTimers) {
      window.clearTimeout(timer);
    }
    this.leadNoteTimers.clear();
    if (!this.running || !this.state || !this.anchors) return;
    const source = leadRandomSource(this.state);
    if (!leadRandomSourceEnabled(this.state, source)) return;
    if (!deferToBoundary) {
      this.scheduleLeadPhrase();
      return;
    }
    const sliderState = sliderStateFromRecord(this.state);
    const phraseSeconds = getPhraseDurationForClockSource(sliderState, sliderState.leadRandomClockSource ?? 'globalPhrase');
    const delaySeconds = getTimeUntilNextBoundaryWall(sliderState.leadRandomClockSource ?? 'globalPhrase', phraseSeconds, this.anchors);
    this.leadPhraseTimer = window.setTimeout(() => this.scheduleLeadPhrase(), delaySeconds * 1000);
  }

  private scheduleLeadPhrase(): void {
    if (!this.running || !this.state || !this.harmonyState || !this.rng || !this.anchors) return;
    const source = leadRandomSource(this.state);
    if (!leadRandomSourceEnabled(this.state, source)) return;
    const sliderState = sliderStateFromRecord(this.state);
    const phraseClock = sliderState.leadRandomClockSource ?? 'globalPhrase';
    const phraseSeconds = getPhraseDurationForClockSource(sliderState, phraseClock);
    const phraseMs = phraseSeconds * 1000;
    const density = boundedNumber(this.state, 'lead1Density', 0.5, 0.1, 12);
    const notesThisPhrase = Math.max(1, Math.round(density * 3 + this.rng() * 2));
    const baseOctaveOffset = boundedInteger(this.state, 'lead1Octave', 1, -1, 2);
    const octaveRange = boundedInteger(this.state, 'lead1OctaveRange', 2, 1, 4);
    const baseLow = 64 + baseOctaveOffset * 12;
    const baseHigh = baseLow + octaveRange * 12;
    const leadTension = getEffectiveTension(
      boundedNumber(this.state, 'tension', 0.3, 0, 1),
      this.state.leadTensionMode === 'locked' || this.state.leadTensionMode === 'bypass'
        ? this.state.leadTensionMode
        : 'follow',
      boundedNumber(this.state, 'leadTensionValue', 0, -0.5, 0.5),
    );
    const chordBias = leadTension < 0 ? 0.9 : 0.9 - leadTension * 0.4;
    const availableNotes = getScaleNotesInRange(
      this.harmonyState.scaleFamily,
      Math.max(24, baseLow),
      Math.min(108, baseHigh),
      this.harmonyState.effectiveRoot,
    );
    const nowWallSec = Date.now() / 1000;
    const timing = phraseTimingForClockSource(phraseClock, phraseSeconds, this.anchors, nowWallSec);
    this.ensureRandomTimingPlan(phraseSeconds, timing.phraseIndex, timing.phraseStartWallSec, baseLow, baseHigh);
    const runtimeNotes: SimpleSequencerVizNote[] = [];
    for (let index = 0; index < notesThisPhrase; index += 1) {
      const timingSeconds = (this.rng() * phraseMs) / 1000;
      if (availableNotes.length === 0) continue;
      const midi = pickChordWeightedNote(this.rng, availableNotes, this.harmonyState.currentChord?.midiNotes, chordBias);
      const velocity = 0.5 + this.rng() * 0.4;
      const sourceId = leadRandomSourceId(source);
      const triggerWallSec = nowWallSec + timingSeconds;
      runtimeNotes.push({
        id: `random-runtime:${timing.phraseIndex}:${triggerWallSec.toFixed(4)}:${source}:${index}:${Math.round(midi)}`,
        source,
        midi,
        label: midiNoteLabel(midi),
        voiceIndex: index,
        triggerSeconds: triggerWallSec - timing.phraseStartWallSec,
        triggerWallSec,
        velocity,
        envelope: envelopeForSource(sliderState, source, 0, phraseSeconds),
      });
      this.scheduleNote(timingSeconds, createCoreProductManualNoteEvent(
        sourceId,
        midi,
        velocity,
        coreProductSynthSequencerHoldSecondsFromState(this.state, sourceId, 0.5) * 1000,
      ), 'lead');
    }
    this.setRandomTimingPlanNotes(runtimeNotes, baseLow, baseHigh);
    const delaySeconds = getTimeUntilNextBoundaryWall(
      phraseClock,
      phraseSeconds,
      this.anchors,
    );
    this.leadPhraseTimer = window.setTimeout(() => this.scheduleLeadPhrase(), delaySeconds * 1000);
  }
}
