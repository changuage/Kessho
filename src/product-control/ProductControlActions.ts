import type { SliderState } from '../ui/state';
import type { ProductDrumVoice, ProductManualSynthNote } from '../audio/product/ProductEngineTypes';
import type { ProductDrumMorphEndpoint, ProductDrumMorphVoice } from './drumMorphOverrideState';
import type {
  MidMorphEditPolicy,
  MorphEndpointName,
  ProductControlReason,
  ProductControlSliderKey,
  ProductControlStatePatch,
  ProductControlTarget,
  ProductSequencerPatch,
  ProductTransportPatch,
} from './ProductControlState';

export type ProductSourceId = string;
export type ProductManualTriggerKind = 'synth-note' | 'drum-voice';

export type ProductControlAction =
  | {
      readonly type: 'slider/edit';
      readonly key: ProductControlSliderKey;
      readonly value: SliderState[ProductControlSliderKey];
      readonly triggerCritical?: boolean;
    }
  | {
      readonly type: 'slider/patch';
      readonly patch: ProductControlStatePatch;
      readonly reason?: ProductControlReason;
      readonly triggerCritical?: boolean;
    }
  | {
      readonly type: 'visible-sliders/commit';
      readonly sliders: SliderState;
      readonly reason?: ProductControlReason;
      readonly triggerCritical?: boolean;
    }
  | {
      readonly type: 'preset/load';
      readonly presetId: string;
      readonly sliders: SliderState;
    }
  | {
      readonly type: 'morph/position-set';
      readonly target: ProductControlTarget;
      readonly position: number;
      readonly triggerCritical?: boolean;
    }
  | {
      readonly type: 'morph/endpoint-replace';
      readonly target: ProductControlTarget;
      readonly endpoint: MorphEndpointName;
      readonly presetId: string;
      readonly sliders: SliderState;
    }
  | {
      readonly type: 'morph/endpoint-edit';
      readonly target: ProductControlTarget;
      readonly endpoint: MorphEndpointName;
      readonly key: ProductControlSliderKey;
      readonly value: SliderState[ProductControlSliderKey];
    }
  | {
      readonly type: 'morph/midpoint-edit';
      readonly target: ProductControlTarget;
      readonly key: ProductControlSliderKey;
      readonly value: SliderState[ProductControlSliderKey];
      readonly policy?: MidMorphEditPolicy;
    }
  | {
      readonly type: 'drum-morph/override-set';
      readonly voice: ProductDrumMorphVoice;
      readonly param: string;
      readonly value: number;
      readonly morphPosition: number;
    }
  | {
      readonly type: 'drum-morph/override-remove';
      readonly voice: ProductDrumMorphVoice;
      readonly param: string;
    }
  | {
      readonly type: 'drum-morph/overrides-clear';
      readonly voice: ProductDrumMorphVoice;
    }
  | {
      readonly type: 'drum-morph/endpoint-clear';
      readonly voice: ProductDrumMorphVoice;
      readonly endpoint: ProductDrumMorphEndpoint;
    }
  | {
      readonly type: 'drum-morph/midpoint-clear';
      readonly voice: ProductDrumMorphVoice;
    }
  | {
      readonly type: 'drum-morph/dual-range-set';
      readonly voice: ProductDrumMorphVoice;
      readonly param: string;
      readonly isDualMode: boolean;
      readonly value: number;
      readonly range?: { min: number; max: number };
      readonly endpoint: ProductDrumMorphEndpoint;
    }
  | {
      readonly type: 'drum-morph/dual-range-remove';
      readonly voice: ProductDrumMorphVoice;
      readonly param: string;
    }
  | {
      readonly type: 'drum-morph/dual-ranges-clear';
      readonly voice: ProductDrumMorphVoice;
    }
  | {
      readonly type: 'sequencer/edit';
      readonly patch: ProductSequencerPatch;
      readonly triggerCritical?: boolean;
    }
  | {
      readonly type: 'transport/edit';
      readonly patch: ProductTransportPatch;
      readonly triggerCritical?: boolean;
    }
  | {
      readonly type: 'manual-trigger/request';
      readonly source: ProductSourceId;
      readonly kind?: ProductManualTriggerKind;
      readonly note?: ProductManualSynthNote;
      readonly voice?: ProductDrumVoice;
      readonly velocity?: number;
    }
  | {
      readonly type: 'session/restore';
      readonly sliders: SliderState;
      readonly morph?: Partial<Pick<import('./ProductControlState').ProductControlState, 'synthMorph' | 'drumMorph' | 'drumMorphOverrides' | 'overrides'>>;
    }
  | {
      readonly type: 'ui/view-change';
      readonly view: string;
    };
