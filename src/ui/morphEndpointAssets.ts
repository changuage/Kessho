import type { SavedPreset } from './state';

export function collectMorphEndpointStates(
  ...presets: Array<SavedPreset | null | undefined>
): Array<Record<string, unknown>> {
  return presets.flatMap((preset) => preset ? [preset.state as unknown as Record<string, unknown>] : []);
}
