import type { SliderState } from '../state';
import type { SliderPageId } from '../sliderHelpCatalog';

export type ProductControlStatus =
  | 'production'
  | 'keep-active-archive-later'
  | 'temporary-product-compatibility'
  | 'test-only';

export interface ProductControlDefinition<K extends keyof SliderState = keyof SliderState, TValue = SliderState[K]> {
  key: K;
  label: string;
  defaultValue: TValue;
  helpPage?: SliderPageId;
  serialize: boolean;
  morphable: boolean;
  abComparable: boolean;
  status: ProductControlStatus;
}

export interface ProductSliderControlDefinition<K extends keyof SliderState = keyof SliderState>
  extends ProductControlDefinition<K, number> {
  kind: 'slider';
  unit?: string;
  logarithmic?: boolean;
}

type ProductSliderControlInput<K extends keyof SliderState> =
  Omit<
    ProductSliderControlDefinition<K>,
    'kind' | 'serialize' | 'morphable' | 'abComparable' | 'status'
  > &
  Partial<Pick<
    ProductSliderControlDefinition<K>,
    'serialize' | 'morphable' | 'abComparable' | 'status'
  >>;

export function defineProductSliderControl<K extends keyof SliderState>(
  definition: ProductSliderControlInput<K>,
): ProductSliderControlDefinition<K> {
  return {
    kind: 'slider',
    serialize: true,
    morphable: true,
    abComparable: true,
    status: 'production',
    ...definition,
  };
}

export function getProductSliderValue(
  state: SliderState,
  control: ProductSliderControlDefinition,
): number {
  const value = state[control.key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : control.defaultValue;
}
