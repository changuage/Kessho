import type { SliderState } from './state';

export function collectMorphEndpointStates<T extends { state: Partial<SliderState> }>(
  ...presets: Array<T | null | undefined>
): Array<Record<string, unknown>> {
  return presets.flatMap((preset) => preset ? [preset.state as unknown as Record<string, unknown>] : []);
}
