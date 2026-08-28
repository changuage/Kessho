import { createCoreProductManualNoteEvent, type CoreProductEvent } from '../coreProductEvents';
import { createCoreProductHarmonyParamEvents } from '../coreProductHarmonyParamEvents';
import {
  ARRANGEMENT_HOST_NEXT_PHRASE_TIMING_KEYS,
  ARRANGEMENT_TRANSPORT_TIMING_KEYS,
  arrangementRestartKey,
  PAD_VOICE_COUNT,
} from '../coreProductArrangementVoiceMapping';
import { coreProductSynthSequencerHoldSecondsFromState } from '../coreProductSequencerHold';
import { getEffectiveTension, updateHarmonyState, type HarmonyState } from '../harmony';
import { createRng, getUtcBucket } from '../rng';
import { getScaleNotesInRange } from '../scales';
import { resolveChordsPerPhrase } from '../chordPhraseTiming';
import {
  getCurrentClockIndexWall,
  getPhraseDurationForClockSource,
  getTimeUntilNextBoundaryWall,
  resolveProgressionPhraseClockSource,
  type TransportAnchors,
  type TransportDebugSnapshot,
} from '../transport';
import { harmonySeedMaterialFromState } from '../harmonySeedMaterial';
import {
  envelopeForSource,
  midiNoteLabel,
  type SimpleSequencerPhrasePreview,
  type SimpleSequencerVizNote,
} from '../simpleSequencerPhrasePreview';
import {
  booleanFromState, boundedInteger, boundedNumber, createSchedulerHarmonyState,
  ensureScheduledSampleAssetForEvent, type EnsureScheduledSampleAsset,
  harmonyChordIntervalSeconds, harmonyParamsFromState, harmonyPhraseSeconds,
  leadRandomSource, leadRandomSourceEnabled, leadRandomSourceId,
  manualNoteEventSourceEnabled, pickChordWeightedNote,
  phraseTimingForClockSource, postManualNoteEventIfSourceEnabled, progressionPhraseSeconds,
  sliderStateFromRecord,
} from '../coreProductArrangementSchedulerUtils';

// Compatibility-only helpers for the isolated Web/TS reference scheduler.
import {
  cloneRuntimePlan,
  createCarryoverPlan,
  createRuntimePlan,
  updateRuntimePlanNotes,
} from '../coreProductArrangementRuntimePlan';
import type { ProductSimpleSequencerVisualPlanActive } from '../product/ProductEngineTypes';
import type { CoreProductTelemetrySnapshot } from '../coreProductTelemetry';
type CoreProductArrangementScheduledNote = {
  delaySeconds: number;
  event: CoreProductEvent;
};

type PostEvent = (event: CoreProductEvent) => void;
type PublishTrigger = (name: string, ...payload: unknown[]) => void;

export function coreProductSampleOffsetForDelay(delaySeconds: number, sampleRate: number): number {
  const frames = Math.round(Math.max(0, delaySeconds) * Math.max(1, sampleRate));
  return Math.min(0xffff_ffff, frames);
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
  private pendingTransportState: Record<string, unknown> | null = null;
  private pendingHostTimingState: Record<string, unknown> | null = null;
  private observedTransportTransitionRevision = 0;
  private randomTimingPlan: SimpleSequencerPhrasePreview | null = null;
  private previousRandomTimingPlan: SimpleSequencerPhrasePreview | null = null;
  private runtimePlanCaptureEnabled: ProductSimpleSequencerVisualPlanActive = {
    padChord: false,
    randomTiming: false,
  };
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
    if (!this.state) {
      this.start(state);
      return;
    }
    const activeState = this.state;
    const candidate = { ...state };
    const timingChanged = ARRANGEMENT_TRANSPORT_TIMING_KEYS.some((key) => activeState[key] !== candidate[key]);
    if (timingChanged || this.pendingTransportState) {
      const candidateMatchesActive = ARRANGEMENT_TRANSPORT_TIMING_KEYS.every((key) => activeState[key] === candidate[key]);
      if (candidateMatchesActive) {
        this.pendingTransportState = null;
      } else {
        this.pendingTransportState = candidate;
      }
      state = {
        ...candidate,
        ...Object.fromEntries(ARRANGEMENT_TRANSPORT_TIMING_KEYS.map((key) => [key, activeState[key]])),
      };
    }
    const hostTimingChanged = ARRANGEMENT_HOST_NEXT_PHRASE_TIMING_KEYS.some((key) => activeState[key] !== candidate[key]);
    if (hostTimingChanged || this.pendingHostTimingState) {
      const candidateMatchesActive = ARRANGEMENT_HOST_NEXT_PHRASE_TIMING_KEYS.every((key) => activeState[key] === candidate[key]);
      this.pendingHostTimingState = candidateMatchesActive ? null : candidate;
      state = {
        ...state,
        ...Object.fromEntries(ARRANGEMENT_HOST_NEXT_PHRASE_TIMING_KEYS.map((key) => [key, activeState[key]])),
      };
    }
    const nextRestartKey = arrangementRestartKey(state);
    if (nextRestartKey !== this.restartKey) {
      const pendingTransportState = this.pendingTransportState;
      const pendingHostTimingState = this.pendingHostTimingState;
      this.start(state, true);
      this.pendingTransportState = pendingTransportState;
      this.pendingHostTimingState = pendingHostTimingState;
      return;
    }
    const previousState = this.state;
    const previousRandomSource = previousState ? leadRandomSource(previousState) : null;
    const previousRandomEnabled = previousState && previousRandomSource
      ? leadRandomSourceEnabled(previousState, previousRandomSource)
      : false;
    this.state = { ...state };
    const randomSource = leadRandomSource(this.state);
    const randomEnabled = leadRandomSourceEnabled(this.state, randomSource);
    if (!randomEnabled) {
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
    this.chordSubTickCount = 0;
    this.randomTimingPlan = null;
    this.previousRandomTimingPlan = null;
    this.restartKey = '';
    this.phraseState = null;
    this.pendingTransportState = null;
    this.pendingHostTimingState = null;
    this.observedTransportTransitionRevision = 0;
  }
  syncTransportTelemetry(telemetry: CoreProductTelemetrySnapshot): void {
    const revision = telemetry.transportTransitionRevision ?? 0;
    if (revision === this.observedTransportTransitionRevision) return;
    this.observedTransportTransitionRevision = revision;
    const pending = this.pendingTransportState;
    this.pendingTransportState = null;
    if (!pending || !this.running) return;
    this.start(pending, false);
  }
  setRuntimePlanCaptureEnabled(active: ProductSimpleSequencerVisualPlanActive): void {
    const next = {
      padChord: active.padChord === true,
      randomTiming: active.randomTiming === true,
    };
    if (!next.randomTiming && this.runtimePlanCaptureEnabled.randomTiming) {
      this.randomTimingPlan = null;
      this.previousRandomTimingPlan = null;
    }
    this.runtimePlanCaptureEnabled = next;
  }
  getTransportDebugState(nowWallSec: number = Date.now() / 1000): Partial<TransportDebugSnapshot> | null {
    if (!this.running || !this.state || !this.anchors) return null;
    const liveSliderState = sliderStateFromRecord(this.state);
    const randomClockSource = liveSliderState.leadRandomClockSource ?? 'globalPhrase';
    const randomPhraseSeconds = getPhraseDurationForClockSource(liveSliderState, randomClockSource);
    return {
      padChordPhraseSeconds: 0,
      nextPadChordBoundaryIn: null,
      padChordPlan: null,
      previousPadChordPlan: null,
      randomTimingPhraseSeconds: randomPhraseSeconds,
      nextRandomTimingBoundaryIn: getTimeUntilNextBoundaryWall(
        randomClockSource,
        randomPhraseSeconds,
        this.anchors,
        nowWallSec,
      ),
      randomTimingPlan: cloneRuntimePlan(this.runtimePlanCaptureEnabled.randomTiming ? this.randomTimingPlan : null),
      previousRandomTimingPlan: cloneRuntimePlan(this.runtimePlanCaptureEnabled.randomTiming ? this.previousRandomTimingPlan : null),
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

  private applyPendingHostTimingState(): void {
    const pending = this.pendingHostTimingState;
    this.pendingHostTimingState = null;
    if (!pending || !this.state) return;
    this.state = {
      ...this.state,
      ...Object.fromEntries(ARRANGEMENT_HOST_NEXT_PHRASE_TIMING_KEYS.map((key) => [key, pending[key]])),
    };
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

  private clearTimer(key: 'harmonyTimer' | 'leadPhraseTimer'): void {
    const timer = this[key];
    if (timer !== null) {
      window.clearTimeout(timer);
      this[key] = null;
    }
  }

  private scheduleNotes(notes: readonly CoreProductArrangementScheduledNote[]): void {
    if (!this.state || notes.length === 0) return;
    const sampleRate = this.getContext()?.sampleRate ?? 48_000;
    const scheduled = notes.map(({ delaySeconds, event }) => ({
      event: {
        ...event,
        sampleOffset: coreProductSampleOffsetForDelay(delaySeconds, sampleRate),
      },
      assetReady: ensureScheduledSampleAssetForEvent(event, this.ensureScheduledSampleAsset),
    }));
    const postPhrase = (): void => {
      if (!this.running || !this.state) return;
      for (const { event } of scheduled) {
        if (!manualNoteEventSourceEnabled(this.state, event)) continue;
        postManualNoteEventIfSourceEnabled(this.state, event, this.postEvent, this.publishTrigger);
      }
    };
    const pendingAssets = scheduled.flatMap(({ assetReady }) => assetReady ? [assetReady] : []);
    if (pendingAssets.length === 0) {
      postPhrase();
      return;
    }
    void Promise.all(pendingAssets)
      .then(postPhrase)
      .catch((error: unknown) => console.warn('Core Product scheduled phrase asset load failed:', error));
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
    if (isPhraseBoundary && !this.pendingTransportState) this.applyPendingHostTimingState();
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
  }

  private startLeadMelody(deferToBoundary: boolean): void {
    this.clearTimer('leadPhraseTimer');
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
    const baseOctaveOffset = boundedInteger(this.state, 'lead1Octave', 1, -4, 4);
    const octaveRange = boundedInteger(this.state, 'lead1OctaveRange', 2, 1, 4);
    const baseLow = 64 + baseOctaveOffset * 12;
    const baseHigh = baseLow + octaveRange * 12;
    const rangeMinMidi = Math.max(24, baseLow);
    const rangeMaxMidi = Math.min(127, baseHigh);
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
      Math.min(127, baseHigh),
      this.harmonyState.effectiveRoot,
    );
    const nowWallSec = Date.now() / 1000;
    const timing = phraseTimingForClockSource(phraseClock, phraseSeconds, this.anchors, nowWallSec);
    const captureRuntimePlan = this.runtimePlanCaptureEnabled.randomTiming;
    if (captureRuntimePlan) {
      this.ensureRandomTimingPlan(phraseSeconds, timing.phraseIndex, timing.phraseStartWallSec, rangeMinMidi, rangeMaxMidi);
    }
    const runtimeNotes: SimpleSequencerVizNote[] = [];
    const scheduledNotes: CoreProductArrangementScheduledNote[] = [];
    for (let index = 0; index < notesThisPhrase; index += 1) {
      const timingSeconds = (this.rng() * phraseMs) / 1000;
      if (availableNotes.length === 0) continue;
      const midi = pickChordWeightedNote(this.rng, availableNotes, this.harmonyState.currentChord?.midiNotes, chordBias);
      const velocity = 0.5 + this.rng() * 0.4;
      const sourceId = leadRandomSourceId(source);
      const padVoiceIndex = source === 'pad1' || source === 'pad2'
        ? index % PAD_VOICE_COUNT
        : undefined;
      if (captureRuntimePlan) {
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
      }
      scheduledNotes.push({
        delaySeconds: timingSeconds,
        event: createCoreProductManualNoteEvent(
          sourceId,
          midi,
          velocity,
          coreProductSynthSequencerHoldSecondsFromState(this.state, sourceId, 0.5) * 1000,
          padVoiceIndex,
        ),
      });
    }
    this.scheduleNotes(scheduledNotes);
    if (captureRuntimePlan) this.setRandomTimingPlanNotes(runtimeNotes, rangeMinMidi, rangeMaxMidi);
    const delaySeconds = getTimeUntilNextBoundaryWall(
      phraseClock,
      phraseSeconds,
      this.anchors,
    );
    this.leadPhraseTimer = window.setTimeout(() => this.scheduleLeadPhrase(), delaySeconds * 1000);
  }
}
