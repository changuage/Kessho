export const APP_SLIDER_THUMB_SIZE_PX = 16;
export const APP_SLIDER_THUMB_SIZE_CSS = `${APP_SLIDER_THUMB_SIZE_PX}px`;

const clampPercent = (percent: number): number => Math.max(0, Math.min(100, percent));

export function getNativeRangeVisualLeft(percent: number): string {
  const safePercent = clampPercent(percent);
  const offsetPx = APP_SLIDER_THUMB_SIZE_PX * (0.5 - safePercent / 100);
  const sign = offsetPx >= 0 ? '+' : '-';
  return `calc(${safePercent}% ${sign} ${Math.abs(offsetPx).toFixed(3)}px)`;
}
