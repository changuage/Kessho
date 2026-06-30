import { createCoreProductManualNoteEvent, type CoreProductEvent } from './coreProductEvents';
import { createCoreProductHarmonyParamEvents } from './coreProductHarmonyParamEvents';
import { arrangementRestartKey, PAD_VOICE_COUNT } from './coreProductArrangementVoiceMapping';
import { coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import { getEffectiveTension, updateHarmonyState, type HarmonyState } from './harmony';
import { createRng, getUtcBucket } from './rng';
import { getScaleNotesInRange } from './scales';
import { resolveChordsPerPhrase } from './chordPhraseTiming';
import {
  getCurrentClockIndexWall,
  getPhraseDurationForClockSource,
  getTimeUntilNextBoundaryWall,
  resolveProgressionPhraseClockSource,
  type TransportAnchors,
  type TransportDebugSnapshot,
} from './transport';
import { harmonySeedMaterialFromState } from './harmonySeedMaterial';
import {
  envelopeForSource,
  midiNoteLabel,
  type SimpleSequencerPhrasePreview,
  type SimpleSequencerVizNote,
} from './simpleSequencerPhrasePreview';
import {
  createCoreProductChordGeneratorSchedule,
  createCoreProductChordSequencerSchedule,
  type CoreProductPadChordSchedule,
} from './coreProductArrangementPadChord';
import { startCoreProductChordSequencerTimer } from './coreProductChordSequencerClock';
import {
  booleanFromState, boundedInteger, boundedNumber, createSchedulerHarmonyState,
  ensureScheduledSampleAssetForEvent, type EnsureScheduledSampleAsset,
  harmonyChordIntervalSeconds, harmonyParamsFromState, harmonyPhraseSeconds,
  leadRandomSource, leadRandomSourceEnabled, leadRandomSourceId,
  manualNoteEventSourceEnabled, padChordHasEnabledTarget, pickChordWeightedNote,
  phraseTimingForClockSource, postManualNoteEventIfSourceEnabled, progressionPhraseSeconds,
  sliderStateFromRecord, synthChordGeneratorSource, synthChordGeneratorSourceEnabled,
} from './coreProductArrangementSchedulerUtils';
import {
  cloneRuntimePlan,
  createCarryoverPlan,
  createRuntimePlan,
  updateRuntimePlanNotes,
} from './coreProductArrangementRuntimePlan';

type PostEvent = (event: CoreProductEvent) => void;
type PublishTrigger = (name: string, ...payload: unknown[]) => void;

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
  private chordSequencerTimer: number | null = null;
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
    private readonly ensureScheduledSampleAsset?: EnsureScheduledSampleAsset,
  ) {}
  start(state: Record<string, unknown> | null | undefined, preserveAnchors = false): void {
    const previousAnchors = preserveAnchors ? this.anchors : null;
    this.stop();
    if (!state) return;
    this.restartKey = arrangementRestartKey(state);
    this.state = { ...state };
    this.phraseState = { ...state };
    this.running = true;
    const sliderState = sliderStateFromRecord(this.state);
    const nowWallSec = Date.now() / 1000;
    this.anchors = previousAnchors ?? {
      localPhraseWallStartSec: nowWallSec,
      localBeatWallStartSec: nowWallSec,
      localBeatCtxStartSec: this.getContext()?.currentTime ?? 0,
    };
    const bucket = getUtcBucket(sliderState.seedWindow === 'day' ? 'day' : 'hour');
    this.rng = createRng(`${bucket}|E_ROOT`);
    this.harmonyState = createSchedulerHarmonyState(sliderState);
    for (const event of createCoreProductHarmonyParamEvents(this.harmonyState)) this.postEvent(event);
    if (booleanFromState(this.state, 'synthChordGeneratorEnabled', false)) this.triggerPadChord(createCoreProductChordGeneratorSchedule, true);
    if (booleanFromState(this.state, 'synthChordSequencerEnabled', false)) this.startChordSequencer();
    this.scheduleHarmonyTicks();
    if (booleanFromState(this.state, 'leadRandomEnabled', false)) {
      this.startLeadMelody(!preserveAnchors && (sliderState.leadRandomSyncPolicy ?? 'nextPhrase') === 'nextPhrase');
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
      this.start(state, true);
      return;
    }
    const previousState = this.state;
    const previousChordGeneratorSource = previousState ? synthChordGeneratorSource(previousState) : null;
    const previousChordGeneratorEnabled = previousState ? synthChordGeneratorSourceEnabled(previousState) : false;
    const previousRandomSource = previousState ? leadRandomSource(previousState) : null;
    const previousRandomEnabled = previousState && previousRandomSource
      ? leadRandomSourceEnabled(previousState, previousRandomSource)
      : false;
    this.state = { ...state };
    if (booleanFromState(this.state, 'synthChordSequencerEnabled', false)) {
      if (this.chordSequencerTimer === null) this.startChordSequencer();
    } else {
      this.clearTimer('chordSequencerTimer');
    }
    const chordGeneratorSource = synthChordGeneratorSource(this.state);
    const chordGeneratorEnabled = synthChordGeneratorSourceEnabled(this.state);
    if (chordGeneratorEnabled && (!previousChordGeneratorEnabled || previousChordGeneratorSource !== chordGeneratorSource)) {
      this.triggerPadChord(createCoreProductChordGeneratorSchedule, true, true);
    } else if (!padChordHasEnabledTarget(this.state)) {
      this.clearNoteTimers(this.padNoteTimers);
      this.padChordPlan = null;
      this.previousPadChordPlan = null;
    }
    const randomSource = leadRandomSource(this.state);
    const randomEnabled = leadRandomSourceEnabled(this.state, randomSource);
    if (!randomEnabled) {
      this.clearNoteTimers(this.leadNoteTimers);
      this.randomTimingPlan = null;
      this.previousRandomTimingPlan = null;
    } else if (!previousRandomEnabled || previousRandomSource !== randomSource) {
      this.startLeadMelody(false);
    }
  }
  stop(): void {
    this.running = false;
    this.clearTimer('harmonyTimer');
    this.clearTimer('leadPhraseTimer');
    this.clearTimer('chordSequencerTimer');
    this.clearNoteTimers(this.padNoteTimers);
    this.clearNoteTimers(this.leadNoteTimers);
    this.chordSubTickCount = 0;
    this.padChordPlan = null;
    this.previousPadChordPlan = null;
    this.randomTimingPlan = null;
    this.previousRandomTimingPlan = null;
    this.restartKey = '';
    this.phraseState = null;
  }
  private clearNoteTimers(timers: Set<number>): void {
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
    timers.clear();
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
    this.previousPadChordPlan = createCarryoverPlan(
      'padChord',
      this.previousPadChordPlan,
      this.padChordPlan,
      phraseSeconds,
      triggerIntervalSeconds,
      phraseIndex,
      phraseStartWallSec,
    );
    this.padChordPlan = createRuntimePlan('padChord', true, phraseSeconds, triggerIntervalSeconds, phraseIndex, phraseStartWallSec);
    return this.padChordPlan;
  }

  private appendPadChordPlanNotes(notes: readonly SimpleSequencerVizNote[]): void {
    if (!this.padChordPlan || notes.length === 0) return;
    this.padChordPlan = updateRuntimePlanNotes(this.padChordPlan, [...this.padChordPlan.notes, ...notes]);
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
    this.previousRandomTimingPlan = createCarryoverPlan(
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
    this.randomTimingPlan = createRuntimePlan('randomTiming', true, phraseSeconds, phraseSeconds, phraseIndex, phraseStartWallSec, rangeMinMidi, rangeMaxMidi);
    return this.randomTimingPlan;
  }

  private setRandomTimingPlanNotes(notes: readonly SimpleSequencerVizNote[], rangeMinMidi: number, rangeMaxMidi: number): void {
    if (!this.randomTimingPlan) return;
    this.randomTimingPlan = updateRuntimePlanNotes(this.randomTimingPlan, notes, rangeMinMidi, rangeMaxMidi);
  }

  private clearTimer(key: 'harmonyTimer' | 'leadPhraseTimer' | 'chordSequencerTimer'): void {
    const timer = this[key];
    if (timer !== null) {
      window.clearTimeout(timer);
      this[key] = null;
    }
  }

  private scheduleNote(delaySeconds: number, event: CoreProductEvent, owner: 'pad' | 'lead'): void {
    const post = (): void => {
      if (!this.state || !manualNoteEventSourceEnabled(this.state, event)) return;
      const postIfEnabled = (): void => {
        if (this.state) postManualNoteEventIfSourceEnabled(this.state, event, this.postEvent, this.publishTrigger);
      };
      const sampleAssetPromise = ensureScheduledSampleAssetForEvent(event, this.ensureScheduledSampleAsset);
      if (!sampleAssetPromise) {
        postIfEnabled();
        return;
      }
      void sampleAssetPromise.then(postIfEnabled).catch((error: unknown) => console.warn('Core Product scheduled sample asset load failed:', error));
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
    if (booleanFromState(this.state, 'synthChordGeneratorEnabled', false)) this.triggerPadChord(createCoreProductChordGeneratorSchedule, true);
    if (booleanFromState(this.state, 'synthChordSequencerEnabled', false) && this.chordSequencerTimer === null) this.startChordSequencer();
  }

  private startChordSequencer(): void {
    this.clearTimer('chordSequencerTimer');
    startCoreProductChordSequencerTimer({
      getState: () => this.state,
      getAnchors: () => this.anchors,
      isRunning: () => this.running,
      isEnabled: () => Boolean(this.state && booleanFromState(this.state, 'synthChordSequencerEnabled', false)),
      trigger: () => this.triggerPadChord(createCoreProductChordSequencerSchedule, false, true),
      setTimer: (timer) => { this.chordSequencerTimer = timer; },
    });
  }

  private triggerPadChord(
    createSchedule: (args: { state: Record<string, unknown>; harmonyState: HarmonyState; rng: () => number; anchors: TransportAnchors | null; nowWallSec: number }) => CoreProductPadChordSchedule,
    appendRuntimePlan: boolean,
    liveState = false,
  ): void {
    if (!this.state || !this.harmonyState || !this.rng) return;
    const state = liveState ? this.state : this.getPhraseState();
    if (!state) return;
    const { phraseSeconds, triggerIntervalSeconds, timing, runtimeNotes, scheduledNotes } = createSchedule({
      state,
      harmonyState: this.harmonyState,
      rng: this.rng,
      anchors: this.anchors,
      nowWallSec: Date.now() / 1000,
    });
    if (appendRuntimePlan && timing) this.ensurePadChordPlan(phraseSeconds, triggerIntervalSeconds, timing.phraseIndex, timing.phraseStartWallSec);
    for (const note of scheduledNotes) this.scheduleNote(note.delaySeconds, note.event, 'pad');
    if (appendRuntimePlan) this.appendPadChordPlanNotes(runtimeNotes);
  }

  private startLeadMelody(deferToBoundary: boolean): void {
    this.clearTimer('leadPhraseTimer');
    this.clearNoteTimers(this.leadNoteTimers);
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
      const padVoiceIndex = source === 'pad1' || source === 'pad2'
        ? index % PAD_VOICE_COUNT
        : undefined;
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
        padVoiceIndex,
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
