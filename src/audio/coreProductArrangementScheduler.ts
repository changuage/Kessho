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
  getPhraseDurationForClockSource,
  getTimeUntilNextBoundaryWall,
  resolveProgressionPhraseClockSource,
  type TransportAnchors,
} from './transport';
import type { SliderState } from '../ui/state';
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
  const bucket = getUtcBucket(state.seedWindow === 'day' ? 'day' : 'hour');
  return createHarmonyState(
    `${bucket}|E_ROOT`,
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

function sourceDistanceValue(state: Record<string, unknown>, key: string): number {
  return boundedNumber(state, key, 0, 0, 1);
}

function leadRandomSourceEnabled(state: Record<string, unknown>, source: 'lead1' | 'lead2' | 'piano'): boolean {
  if (!booleanFromState(state, 'leadRandomEnabled', false)) return false;
  if (source === 'lead2') return booleanFromState(state, 'lead2Enabled', false);
  if (source === 'piano') return booleanFromState(state, 'pianoEnabled', false);
  return booleanFromState(state, 'leadEnabled', false);
}
export class CoreProductArrangementScheduler {
  private state: Record<string, unknown> | null = null;
  private anchors: TransportAnchors | null = null;
  private harmonyState: HarmonyState | null = null;
  private rng: (() => number) | null = null;
  private running = false;
  private chordSubTickCount = 0;
  private harmonyTimer: number | null = null;
  private leadPhraseTimer: number | null = null;
  private readonly padNoteTimers = new Set<number>();
  private readonly leadNoteTimers = new Set<number>();
  private restartKey = '';

  constructor(
    private readonly postEvent: PostEvent,
    private readonly getContext: () => AudioContext | null,
    private readonly publishTrigger?: PublishTrigger,
  ) {}

  start(state: Record<string, unknown> | null | undefined): void {
    this.stop();
    if (!state) return;
    this.state = { ...state };
    this.restartKey = arrangementRestartKey(this.state);
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
      this.restartKey = this.state ? arrangementRestartKey(this.state) : '';
      return;
    }
    if (!state) {
      this.stop();
      this.state = null;
      this.restartKey = '';
      return;
    }
    const nextState = { ...state };
    const nextRestartKey = arrangementRestartKey(nextState);
    if (nextRestartKey !== this.restartKey) {
      this.start(nextState);
      return;
    }
    this.state = nextState;
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
    this.restartKey = '';
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
    const sliderState = sliderStateFromRecord(this.state);
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
    const sliderState = sliderStateFromRecord(this.state);
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
    const sliderState = sliderStateFromRecord(this.state);
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
      `${getUtcBucket(sliderState.seedWindow === 'day' ? 'day' : 'hour')}|${JSON.stringify(sliderState)}|E_ROOT`,
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
    const state = this.state;
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
    const triggerIntervalSeconds = padChordTriggerIntervalSeconds(sliderStateFromRecord(this.state));
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
      for (let index = 0; index < voiceCount; index += 1) {
        const midi = clamp(chordMidi[index % chordMidi.length]! + octaveShift, 0, 127);
        const holdSeconds = coreProductSynthSequencerHoldSecondsFromState(state, nonPadSourceId, 0.5);
        this.scheduleNote(voiceOffsets[index] ?? 0, createCoreProductManualNoteEvent(
          nonPadSourceId,
          midi,
          1,
          holdSeconds * 1000,
        ), 'lead');
      }
      return;
    }

    const { pad1Mask, pad2Mask } = padChordVoiceMasksForSource(source, availablePadMask, pad2Assign, voiceCount);
    if ((pad1Mask | pad2Mask) === 0) return;
    const pad1ChordMidi = enabledChordMidiForMask(chordMidi, pad1Mask);
    const pad2ChordMidi = enabledChordMidiForMask(chordMidi, pad2Mask);
    for (let voiceIndex = 0; voiceIndex < PAD_VOICE_COUNT; voiceIndex += 1) {
      const bit = 1 << voiceIndex;
      const delaySeconds = voiceOffsets[voiceIndex] ?? 0;
      if ((pad1Mask & bit) !== 0) {
        const enabledIndex = enabledVoiceRank(pad1Mask, voiceIndex);
        const midi = clamp(pad1ChordMidi[enabledIndex % pad1ChordMidi.length]! + octaveShift, 0, 127);
        const holdSeconds = coreProductPadEnvelopeGateSecondsFromState(this.state, 'pad1', {
          triggerIntervalSeconds,
          voiceDelaySeconds: delaySeconds,
        });
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
        const holdSeconds = coreProductPadEnvelopeGateSecondsFromState(this.state, 'pad2', {
          triggerIntervalSeconds,
          voiceDelaySeconds: delaySeconds,
        });
        this.scheduleNote(delaySeconds, createCoreProductManualNoteEvent(
          CORE_PRODUCT_SOURCE_IDS.pad2,
          midi,
          1,
          holdSeconds * 1000,
          voiceIndex,
        ), 'pad');
      }
    }
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
    const phraseSeconds = getPhraseDurationForClockSource(sliderState, sliderState.leadRandomClockSource ?? 'globalPhrase');
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
    for (let index = 0; index < notesThisPhrase; index += 1) {
      const timingSeconds = (this.rng() * phraseMs) / 1000;
      if (availableNotes.length === 0) continue;
      const midi = pickChordWeightedNote(this.rng, availableNotes, this.harmonyState.currentChord?.midiNotes, chordBias);
      const velocity = 0.5 + this.rng() * 0.4;
      const sourceId = leadRandomSourceId(source);
      this.scheduleNote(timingSeconds, createCoreProductManualNoteEvent(
        sourceId,
        midi,
        velocity,
        coreProductSynthSequencerHoldSecondsFromState(this.state, sourceId, 0.5) * 1000,
      ), 'lead');
    }
    const delaySeconds = getTimeUntilNextBoundaryWall(
      sliderState.leadRandomClockSource ?? 'globalPhrase',
      phraseSeconds,
      this.anchors,
    );
    this.leadPhraseTimer = window.setTimeout(() => this.scheduleLeadPhrase(), delaySeconds * 1000);
  }
}
