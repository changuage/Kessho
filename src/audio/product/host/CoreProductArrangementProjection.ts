import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { harmonyPhraseSeconds, sliderStateFromRecord } from '../../coreProductArrangementSchedulerUtils';
import { getPhraseDurationForClockSource, getTimeUntilNextBoundaryWall, type TransportAnchors, type TransportDebugSnapshot } from '../../transport';
import type { ProductSimpleSequencerVisualPlanActive } from '../ProductEngineTypes';

export class CoreProductArrangementProjection {
  private state: Record<string, unknown> | null = null;
  private anchors: TransportAnchors | null = null;
  private running = false;

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
  }

  setRuntimePlanCaptureEnabled(_active: ProductSimpleSequencerVisualPlanActive): void {}

  syncTransportTelemetry(_telemetry: CoreProductTelemetrySnapshot): void {}

  getTransportDebugState(nowWallSec: number = Date.now() / 1000): Partial<TransportDebugSnapshot> | null {
    if (!this.running || !this.state || !this.anchors) return null;
    const sliderState = sliderStateFromRecord(this.state);
    const padClockSource = sliderState.harmonyClockSource ?? 'globalPhrase';
    const padPhraseSeconds = harmonyPhraseSeconds(sliderState);
    const randomClockSource = sliderState.leadRandomClockSource ?? 'globalPhrase';
    const randomPhraseSeconds = getPhraseDurationForClockSource(sliderState, randomClockSource);
    return {
      padChordPhraseSeconds: padPhraseSeconds,
      nextPadChordBoundaryIn: getTimeUntilNextBoundaryWall(
        padClockSource,
        padPhraseSeconds,
        this.anchors,
        nowWallSec,
      ),
      padChordPlan: null,
      previousPadChordPlan: null,
      randomTimingPhraseSeconds: randomPhraseSeconds,
      nextRandomTimingBoundaryIn: getTimeUntilNextBoundaryWall(
        randomClockSource,
        randomPhraseSeconds,
        this.anchors,
        nowWallSec,
      ),
      randomTimingPlan: null,
      previousRandomTimingPlan: null,
    };
  }
}
