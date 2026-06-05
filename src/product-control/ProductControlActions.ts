import type { SliderState } from '../ui/state';
import type {
  MidMorphEditPolicy,
  MorphEndpointName,
  ProductControlSliderKey,
  ProductControlTarget,
  ProductSequencerPatch,
  ProductTransportPatch,
} from './ProductControlState';

export type ProductSourceId = string;

export type ProductControlAction =
  | {
      readonly type: 'slider/edit';
      readonly key: ProductControlSliderKey;
      readonly value: SliderState[ProductControlSliderKey];
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
    }
  | {
      readonly type: 'session/restore';
      readonly sliders: SliderState;
      readonly morph?: Partial<Pick<import('./ProductControlState').ProductControlState, 'synthMorph' | 'drumMorph' | 'overrides'>>;
    }
  | {
      readonly type: 'ui/view-change';
      readonly view: string;
    };
