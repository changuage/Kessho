import type { CoreProductEvent } from '../../coreProductEvents';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';

const GENERATED_SEQUENCER_CAPTURE_EVENT_HISTORY_LIMIT = 256;

type GeneratedSequencerCaptureEvents = NonNullable<
  CoreProductTelemetrySnapshot['generatedSequencerCaptureEvents']
>;

export class CoreProductGeneratedSequencerCaptureTelemetryHistory {
  private events: GeneratedSequencerCaptureEvents = [];

  clearForEvent(
    event: CoreProductEvent,
    latestTelemetry: CoreProductTelemetrySnapshot | null,
  ): CoreProductTelemetrySnapshot | null {
    if (event.eventKind !== KESSHO_PRODUCT_EVENT_IDS.GeneratedSequencerCapture) {
      return latestTelemetry;
    }
    this.events = [];
    return latestTelemetry
      ? {
          ...latestTelemetry,
          generatedSequencerCaptureEvents: [],
          generatedSequencerCaptureOverflowCount: 0,
        }
      : null;
  }

  withHistory(telemetry: CoreProductTelemetrySnapshot): CoreProductTelemetrySnapshot {
    const incoming = telemetry.generatedSequencerCaptureEvents ?? [];
    if (incoming.length > 0) {
      let next = this.events;
      for (const event of incoming) {
        if (next.some((item) => item.eventId === event.eventId)) continue;
        if (next === this.events) next = [...this.events];
        next.push(event);
      }
      this.events = next.length > GENERATED_SEQUENCER_CAPTURE_EVENT_HISTORY_LIMIT
        ? next.slice(-GENERATED_SEQUENCER_CAPTURE_EVENT_HISTORY_LIMIT)
        : next;
    }

    if (this.events.length === 0) return telemetry;
    return {
      ...telemetry,
      generatedSequencerCaptureEvents: this.events,
    };
  }
}
