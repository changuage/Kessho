import type { SliderState } from './state';

export function collectChangedStatePatch(prev: SliderState, next: SliderState): Partial<SliderState> {
  const patch: Partial<SliderState> = {};
  for (const key of Object.keys(next) as Array<keyof SliderState>) {
    if (!Object.is(prev[key], next[key])) {
      (patch as Record<string, unknown>)[key as string] = next[key];
    }
  }
  return patch;
}
