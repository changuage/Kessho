import type { CoreProductEvent } from '../../coreProductEvents';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';

export type ProductAutoCycleConfig = {
  enabled: boolean;
  initialPosition: number;
  playPhrases: number;
  transitionPhrases: number;
  revision: number;
  preservePhase?: boolean;
};

function finiteClamped(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function createCoreProductAutoCycleEvent(config: ProductAutoCycleConfig): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.ConfigureGlobalAutoCycle,
    value: finiteClamped(config.initialPosition, 0, 1, 0),
    value2: finiteClamped(config.playPhrases, 0, 1024, 1),
    value3: finiteClamped(config.transitionPhrases, 0, 1024, 1),
    value4: Math.max(0, Math.round(Number.isFinite(config.revision) ? config.revision : 0)),
    flags: (config.enabled ? 1 : 0) | (config.preservePhase ? 2 : 0),
  };
}

export function autoCyclePhaseLabel(phase: number, position: number): string {
  switch (phase) {
    case 1: return 'Hold';
    case 2: return position <= 0.5 ? 'Morph → A' : 'Morph → B';
    case 3: return 'Playing A';
    case 4: return 'Morph A→B';
    case 5: return 'Playing B';
    case 6: return 'Morph B→A';
    default: return 'Off';
  }
}
