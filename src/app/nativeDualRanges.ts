import type { DualSliderRange } from '../ui/DualSlider';
import type { SliderState } from '../ui/state';

export type DualSliderState = Partial<Record<keyof SliderState, DualSliderRange>>;

export function extractNativeDualRanges(ranges: DualSliderState): Record<string, { min: number; max: number }> {
  const output: Record<string, { min: number; max: number }> = {};
  for (const [key, range] of Object.entries(ranges)) {
    if (!range) continue;
    output[key] = { min: range.min, max: range.max };
  }
  return output;
}
