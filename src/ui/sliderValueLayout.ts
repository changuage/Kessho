export interface SliderValueSlotInfo {
  min: number;
  max: number;
}

function getUniqueCandidates(min: number, max: number): number[] {
  return Array.from(
    new Set(
      [min, max, 0, (min + max) / 2].filter((value) => Number.isFinite(value)),
    ),
  );
}

function getLongestFormattedValue(
  info: SliderValueSlotInfo,
  formatValue: (value: number) => string,
): string {
  return getUniqueCandidates(info.min, info.max).reduce((longest, value) => {
    const formatted = formatValue(value);
    return formatted.length > longest.length ? formatted : longest;
  }, '');
}

export function getSliderValueSlotWidthCh(
  info: SliderValueSlotInfo,
  formatValue: (value: number) => string,
  unit?: string,
): number {
  const longestValue = getLongestFormattedValue(info, formatValue);
  return Math.max(4, longestValue.length + (unit?.length ?? 0) + 1);
}

export function getDualSliderValueSlotWidthCh(
  info: SliderValueSlotInfo,
  formatValue: (value: number) => string,
  unit?: string,
): number {
  const longestValue = getLongestFormattedValue(info, formatValue);
  const example = `${longestValue}-${longestValue}${unit || ''} (${longestValue})`;
  return Math.max(10, example.length + 1);
}
