import type { CoreProductSimpleSequencerVisualEvent, CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { harmonyPhraseSeconds, runtimeSourceFromSourceId, sliderStateFromRecord } from '../../coreProductArrangementSchedulerUtils';
import { cloneRuntimePlan, createCarryoverPlan, createRuntimePlan, updateRuntimePlanNotes } from '../../coreProductArrangementRuntimePlan';
import { envelopeForSource, midiNoteLabel } from '../../simpleSequencerPhrasePreview';
import type { SimpleSequencerPhrasePreview, SimpleSequencerVizNote } from '../../simpleSequencerRuntimePlan';
import { getPhraseDurationForClockSource, getTimeUntilNextBoundaryWall, type TransportAnchors, type TransportDebugSnapshot } from '../../transport';
import type { ProductSimpleSequencerVisualPlanActive } from '../ProductEngineTypes';

function nextPlanBoundaryIn(plan: SimpleSequencerPhrasePreview | null, nowWallSec: number): number | null {
  const start = plan?.phraseStartWallSec;
  const period = plan?.phraseSeconds ?? 0;
  if (start == null || !Number.isFinite(start) || !(period > 0)) return null;
  const elapsed = nowWallSec - start;
  const phase = ((elapsed % period) + period) % period;
  return phase < 0.001 ? period : period - phase;
}

export class CoreProductArrangementProjection {
  private state: Record<string, unknown> | null = null;
  private anchors: TransportAnchors | null = null;
  private running = false;
  private captureActive: ProductSimpleSequencerVisualPlanActive = { padChord: false, randomTiming: false };
  private padChordPlan: SimpleSequencerPhrasePreview | null = null;
  private previousPadChordPlan: SimpleSequencerPhrasePreview | null = null;
  private randomTimingPlan: SimpleSequencerPhrasePreview | null = null;
  private previousRandomTimingPlan: SimpleSequencerPhrasePreview | null = null;
  private lastVisualEventId = 0;
  private sealedPadChordPhraseIndex: number | null = null;
  private sealedRandomTimingPhraseIndex: number | null = null;

  constructor(
    _postEvent: unknown,
    private readonly getContext: () => AudioContext | null,
    _publishTrigger?: unknown,
    _ensureScheduledSampleAsset?: unknown,
  ) {}

  start(state: Record<string, unknown> | null | undefined): void {
    this.state = state ? { ...state } : null;
    this.running = Boolean(this.state);
    if (!this.running) {
      this.anchors = null;
      return;
    }
    const nowWallSec = Date.now() / 1000;
    this.anchors = {
      localPhraseWallStartSec: nowWallSec,
      localBeatWallStartSec: nowWallSec,
      localBeatCtxStartSec: this.getContext()?.currentTime ?? 0,
    };
  }

  update(state: Record<string, unknown> | null | undefined): void {
    if (state && !this.anchors) {
      this.start(state);
      return;
    }
    this.state = state ? { ...state } : null;
    this.running = Boolean(this.state);
    if (!this.running) this.anchors = null;
  }

  stop(): void {
    this.running = false;
    this.state = null;
    this.anchors = null;
    this.clearPlans();
  }

  setRuntimePlanCaptureEnabled(active: ProductSimpleSequencerVisualPlanActive): void {
    const next = { padChord: Boolean(active.padChord), randomTiming: Boolean(active.randomTiming) };
    if (!next.padChord) {
      this.padChordPlan = null;
      this.previousPadChordPlan = null;
      this.sealedPadChordPhraseIndex = null;
    }
    if (!next.randomTiming) {
      this.randomTimingPlan = null;
      this.previousRandomTimingPlan = null;
      this.sealedRandomTimingPhraseIndex = null;
    }
    this.captureActive = next;
  }

  syncTransportTelemetry(telemetry: CoreProductTelemetrySnapshot): void {
    if (!this.running || !this.state) return;
    const sampleRate = telemetry.sampleRate ?? 0;
    const currentSample = telemetry.absoluteSampleTime ?? 0;
    if (!(sampleRate > 0) || !Number.isFinite(currentSample)) return;
    const nowWallSec = Date.now() / 1000;
    let receivedPadChordPlan = false;
    let receivedRandomTimingPlan = false;
    for (const event of telemetry.simpleSequencerVisualEvents ?? []) {
      if (event.eventId <= this.lastVisualEventId) continue;
      this.lastVisualEventId = event.eventId;
      if (event.kind === 'padChord' && !this.captureActive.padChord) continue;
      if (event.kind === 'randomTiming' && !this.captureActive.randomTiming) continue;
      if (event.kind === 'padChord' && this.sealedPadChordPhraseIndex === event.phraseIndex) continue;
      if (event.kind === 'randomTiming' && this.sealedRandomTimingPhraseIndex === event.phraseIndex) continue;
      this.consumeVisualEvent(event, sampleRate, currentSample, nowWallSec);
      if (event.kind === 'padChord') receivedPadChordPlan = true;
      else receivedRandomTimingPlan = true;
    }
    // All notes for a newly generated phrase are delivered together. Seal the
    // snapshot after that telemetry batch so later control or trigger events
    // cannot visually rewrite a phrase already under the playhead.
    if (receivedPadChordPlan) this.sealedPadChordPhraseIndex = this.padChordPlan?.phraseIndex ?? null;
    if (receivedRandomTimingPlan) this.sealedRandomTimingPhraseIndex = this.randomTimingPlan?.phraseIndex ?? null;
  }

  private clearPlans(): void {
    this.padChordPlan = null;
    this.previousPadChordPlan = null;
    this.randomTimingPlan = null;
    this.previousRandomTimingPlan = null;
    this.lastVisualEventId = 0;
    this.sealedPadChordPhraseIndex = null;
    this.sealedRandomTimingPhraseIndex = null;
  }

  private consumeVisualEvent(
    event: CoreProductSimpleSequencerVisualEvent,
    sampleRate: number,
    currentSample: number,
    nowWallSec: number,
  ): void {
    if (!this.state) return;
    const phraseSeconds = Math.max(0.001, event.phraseSeconds);
    const triggerIntervalSeconds = Math.max(0.001, event.triggerIntervalSeconds);
    const phraseStartWallSec = nowWallSec + (event.phraseStartSample - currentSample) / sampleRate;
    const triggerWallSec = nowWallSec + (event.absoluteSample - currentSample) / sampleRate;
    const source = runtimeSourceFromSourceId(event.targetSourceId);
    const sliderState = sliderStateFromRecord(this.state);
    const modeledEnvelope = envelopeForSource(sliderState, source, 0, triggerIntervalSeconds);
    const note: SimpleSequencerVizNote = {
      id: `core-simple:${event.eventId}`,
      source,
      midi: event.midiNote,
      label: midiNoteLabel(event.midiNote),
      voiceIndex: event.voiceIndex,
      triggerSeconds: (event.absoluteSample - event.phraseStartSample) / sampleRate,
      triggerWallSec,
      velocity: event.velocity,
      envelope: {
        ...modeledEnvelope,
        gateSeconds: Math.max(0.02, event.gateSeconds),
      },
    };
    if (event.kind === 'padChord') {
      if (!this.padChordPlan || this.padChordPlan.phraseIndex !== event.phraseIndex) {
        this.previousPadChordPlan = createCarryoverPlan(
          'padChord',
          this.previousPadChordPlan,
          this.padChordPlan,
          phraseSeconds,
          triggerIntervalSeconds,
          event.phraseIndex,
          phraseStartWallSec,
        );
        this.padChordPlan = createRuntimePlan(
          'padChord', true, phraseSeconds, triggerIntervalSeconds,
          event.phraseIndex, phraseStartWallSec,
        );
      }
      this.padChordPlan = updateRuntimePlanNotes(this.padChordPlan, [...this.padChordPlan.notes, note]);
      return;
    }
    const rangeMinMidi = 64 + Math.round(Number(this.state.lead1Octave ?? 1)) * 12;
    const rangeMaxMidi = rangeMinMidi + Math.round(Number(this.state.lead1OctaveRange ?? 2)) * 12;
    if (!this.randomTimingPlan || this.randomTimingPlan.phraseIndex !== event.phraseIndex) {
      this.previousRandomTimingPlan = createCarryoverPlan(
        'randomTiming',
        this.previousRandomTimingPlan,
        this.randomTimingPlan,
        phraseSeconds,
        phraseSeconds,
        event.phraseIndex,
        phraseStartWallSec,
        rangeMinMidi,
        rangeMaxMidi,
      );
      this.randomTimingPlan = createRuntimePlan(
        'randomTiming', true, phraseSeconds, phraseSeconds,
        event.phraseIndex, phraseStartWallSec, rangeMinMidi, rangeMaxMidi,
      );
    }
    this.randomTimingPlan = updateRuntimePlanNotes(
      this.randomTimingPlan,
      [...this.randomTimingPlan.notes, note],
      rangeMinMidi,
      rangeMaxMidi,
    );
  }

  getTransportDebugState(nowWallSec: number = Date.now() / 1000): Partial<TransportDebugSnapshot> | null {
    if (!this.running || !this.state || !this.anchors) return null;
    const sliderState = sliderStateFromRecord(this.state);
    const padClockSource = sliderState.harmonyClockSource ?? 'globalPhrase';
    const padPhraseSeconds = harmonyPhraseSeconds(sliderState);
    const randomClockSource = sliderState.leadRandomClockSource ?? 'globalPhrase';
    const randomPhraseSeconds = getPhraseDurationForClockSource(sliderState, randomClockSource);
    const padPlan = this.captureActive.padChord ? this.padChordPlan : null;
    const randomPlan = this.captureActive.randomTiming ? this.randomTimingPlan : null;
    return {
      simpleSequencerPlansAuthoritative: true,
      padChordPhraseSeconds: padPhraseSeconds,
      nextPadChordBoundaryIn: nextPlanBoundaryIn(padPlan, nowWallSec) ?? getTimeUntilNextBoundaryWall(
        padClockSource,
        padPhraseSeconds,
        this.anchors,
        nowWallSec,
      ),
      padChordPlan: cloneRuntimePlan(padPlan),
      previousPadChordPlan: cloneRuntimePlan(this.captureActive.padChord ? this.previousPadChordPlan : null),
      randomTimingPhraseSeconds: randomPhraseSeconds,
      nextRandomTimingBoundaryIn: nextPlanBoundaryIn(randomPlan, nowWallSec) ?? getTimeUntilNextBoundaryWall(
        randomClockSource,
        randomPhraseSeconds,
        this.anchors,
        nowWallSec,
      ),
      randomTimingPlan: cloneRuntimePlan(randomPlan),
      previousRandomTimingPlan: cloneRuntimePlan(this.captureActive.randomTiming ? this.previousRandomTimingPlan : null),
    };
  }
}
