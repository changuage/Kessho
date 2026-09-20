export const PRODUCT_INTERACTION_VERSION = 1;
export const PRODUCT_INTERACTION_SOURCE_COUNT = 10;

export const PRODUCT_INTERACTION_SOURCE = {
  master: 0, pad1: 1, pad2: 2, lead1: 3, lead2: 4,
  drums: 5, sample1: 6, soundscape: 7, sample2: 8, fx: 9,
} as const;

export const PRODUCT_INTERACTION_PARENT = {
  none: 0, master: 1, synths: 2, drums: 3, samples: 4,
  soundscape: 5, fx: 6, transport: 7, interaction: 8,
} as const;

export const PRODUCT_INTERACTION_CHILD = {
  none: 0, pad1: 1, pad2: 2, lead1: 3, lead2: 4, drum: 5,
  sample1: 6, soundscape: 7, sample2: 8, delayA: 9, delayB: 10,
  granular: 11, reverb: 12, degrade: 13,
} as const;

export const PRODUCT_INTERACTION_TAP = {
  none: 0, preSource: 1, postSource: 2, postFx: 3, master: 4,
} as const;

export const PRODUCT_INTERACTION_ORIGIN = {
  unknown: 0, sequencer: 1, randomTiming: 2, arrangement: 3,
  manual: 4, midi: 5, interaction: 6, system: 7,
} as const;

export const PRODUCT_INTERACTION_EVENT = {
  none: 0, transportStarted: 1, transportStopped: 2, transportBeat: 3,
  transportBar: 4, transportPhrase: 5, voiceTriggered: 6, drumTriggered: 7,
  sampleTriggered: 8, textureStarted: 9, textureEnded: 10,
  sampleHoldTriggered: 11, analysisOnset: 12, effectStarted: 13,
  effectReleased: 14, effectRejected: 15, morphStarted: 16, morphCompleted: 17,
} as const;

export const PRODUCT_INTERACTION_SIGNAL = {
  none: 0, analysisEnvelope: 1, analysisPeak: 2, analysisRms: 3,
  analysisOnsetStrength: 4, synthesisEnvelope: 5, modulationValue: 6,
  transportPhase: 7, pointerX: 8, pointerY: 9, pointerVelocity: 10,
  dragVelocity: 11,
} as const;

export const PRODUCT_INTERACTION_COMMAND = {
  none: 0, performanceRatchet: 1, performanceReverse: 2,
  performanceFreeze: 3, performanceFilter: 4, performanceDelay: 5,
  performanceGranular: 6, presetMorph: 7, transportPlay: 8, transportStop: 9,
} as const;

export const PRODUCT_INTERACTION_DEMAND = {
  events: 1 << 0,
  envelope: 1 << 1,
  peak: 1 << 2,
  rms: 1 << 3,
  onset: 1 << 4,
  transport: 1 << 5,
  modulation: 1 << 6,
  all: (1 << 7) - 1,
} as const;

type ValueOf<T> = T[keyof T];
export type ProductInteractionParentId = ValueOf<typeof PRODUCT_INTERACTION_PARENT>;
export type ProductInteractionChildId = ValueOf<typeof PRODUCT_INTERACTION_CHILD>;
export type ProductInteractionTapId = ValueOf<typeof PRODUCT_INTERACTION_TAP>;
export type ProductInteractionOriginId = ValueOf<typeof PRODUCT_INTERACTION_ORIGIN>;
export type ProductInteractionEventType = ValueOf<typeof PRODUCT_INTERACTION_EVENT>;
export type ProductInteractionSignalType = ValueOf<typeof PRODUCT_INTERACTION_SIGNAL>;
export type ProductInteractionCommandType = ValueOf<typeof PRODUCT_INTERACTION_COMMAND>;

export interface ProductInteractionEvent {
  type: ProductInteractionEventType;
  parent: ProductInteractionParentId;
  child: ProductInteractionChildId;
  origin: ProductInteractionOriginId;
  tap: ProductInteractionTapId;
  flags: number;
  sampleFrame: number;
  value: number;
  strength: number;
}

export interface ProductInteractionSignal {
  type: ProductInteractionSignalType;
  parent: ProductInteractionParentId;
  child: ProductInteractionChildId;
  tap: ProductInteractionTapId;
  flags: number;
  sampleFrame: number;
  value: number;
}

export interface ProductInteractionCommand {
  type: ProductInteractionCommandType;
  targetParent: ProductInteractionParentId;
  targetChild: ProductInteractionChildId;
  origin: ProductInteractionOriginId;
  flags: number;
  sampleFrame: number;
  value: number;
}

export interface ProductInteractionSignalSnapshot {
  version: number;
  revision: number;
  demandMask: number;
  sourceMask: number;
  validSourceMask: number;
  sampleFrame: number;
  envelope: number[];
  peak: number[];
  rms: number[];
  onsetStrength: number[];
}
