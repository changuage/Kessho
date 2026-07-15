import type { SliderState } from '../../../ui/state';

/**
 * Runtime walk positions are continuous, but many parameters are quantized.
 * Only an effective state-value change warrants the fallback engine's costly
 * monolithic update path.
 */
export function getChangedRuntimeWalkParameterKeys(
  previousState: SliderState | null,
  nextState: SliderState,
  candidateKeys: Iterable<string>,
): string[] {
  if (!previousState) return [...candidateKeys];
  const previous = previousState as unknown as Record<string, unknown>;
  const next = nextState as unknown as Record<string, unknown>;
  const changed: string[] = [];
  for (const key of candidateKeys) {
    if (!Object.is(previous[key], next[key])) changed.push(key);
  }
  return changed;
}
