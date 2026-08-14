import type { SliderMode } from '../state';

const SINE_WAVE_PATH = 'M1 8C3 2 6 2 8 8S13 14 15 8S20 2 23 8';

export function ModulationModeIcon({ mode }: { mode: SliderMode }) {
  const path = mode === 'walk'
    ? 'M1 11L4 6L7 9L10 3L13 12L16 7L19 10L23 4'
    : mode === 'sampleHold'
      ? 'M1 12H6V4H12V10H18V2H23'
      : mode === 'shape' ? SINE_WAVE_PATH : undefined;
  return <svg className="sl-slider-mode-icon" viewBox="0 0 24 16" focusable="false" aria-hidden="true">
    {path ? <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : <circle cx="12" cy="8" r="4" fill="currentColor" />}
  </svg>;
}
