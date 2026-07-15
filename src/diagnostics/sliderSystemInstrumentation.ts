export type SliderSystemCounter =
  | 'sliderValueCallbacks'
  | 'rangeCallbacks'
  | 'productRangeEvents'
  | 'runtimeStoreListenerNotifications'
  | 'visualizerRootCommits'
  | 'visualizerIndicatorRowCommits';

export type SliderSystemCounters = Record<SliderSystemCounter, number>;

const enabled = Boolean(import.meta.env?.DEV);

const counters: SliderSystemCounters = {
  sliderValueCallbacks: 0,
  rangeCallbacks: 0,
  productRangeEvents: 0,
  runtimeStoreListenerNotifications: 0,
  visualizerRootCommits: 0,
  visualizerIndicatorRowCommits: 0,
};

export function recordSliderSystemCounter(counter: SliderSystemCounter, amount = 1): void {
  if (!enabled || amount <= 0) return;
  counters[counter] += amount;
}

export function getSliderSystemCounters(): Readonly<SliderSystemCounters> {
  return { ...counters };
}

export function resetSliderSystemCounters(): void {
  if (!enabled) return;
  for (const key of Object.keys(counters) as SliderSystemCounter[]) counters[key] = 0;
}
