import type { DawOutputRoutingConfig } from '../../dawOutputRouting';
import type { ProductLiveNoteEvent } from '../liveNoteEvents';
import type {
  ProductDrumVoice,
  ProductEvent,
  ProductExternalState,
  ProductManualSynthNote,
  ProductMidiMessage,
} from '../ProductEngineTypes';

export type ProductEngineCommandPort = {
  setOutputGain(target: number, durationSeconds?: number): void;
  setDawOutputRouting(config: DawOutputRoutingConfig): void;
  setDawOutputDeviceId(deviceId: string | null): Promise<boolean>;
  resetCofDrift(): void;
  pushMidiMessage(message: ProductMidiMessage): void;
  enqueueRealtimeEvent(event: ProductEvent): Promise<void>;
  enqueueRealtimeEvents(events: readonly ProductEvent[]): Promise<void>;
  enqueueLiveNoteEvent(event: ProductLiveNoteEvent): Promise<void>;
  auditionSynthNote(note: ProductManualSynthNote, externalState?: ProductExternalState): Promise<void>;
  auditionSynthNotes(notes: ProductManualSynthNote[], externalState?: ProductExternalState): Promise<void>;
  triggerDrumVoice(voice: ProductDrumVoice, velocity?: number, externalState?: ProductExternalState): Promise<void>;
};
