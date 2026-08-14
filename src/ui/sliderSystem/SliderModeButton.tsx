import type { SliderMode } from '../state';
import type { ModulationSlot } from './dualConfigReducer';
import { ModulationModeIcon } from './SliderModeIcon';

const MODE_LABEL: Record<SliderMode, string> = { single: 'Single', walk: 'Walk', sampleHold: 'Sample & Hold', shape: 'Shape' };

export function SliderModeButton({ mode, disabled, modulationSlot, onModeCycle }: { mode: SliderMode; disabled: boolean; modulationSlot?: ModulationSlot; onModeCycle?: () => void }) {
  const prefix = modulationSlot ? `Mod ${modulationSlot.toUpperCase()}: ` : 'Mode: ';
  return <button type="button" className={`sl-slider-mode sl-slider-mode--${mode}${modulationSlot ? ` sl-slider-mode--mod-${modulationSlot}` : ''}${disabled ? '' : ' interactive'}`} aria-label={modulationSlot ? `${prefix}${MODE_LABEL[mode]}` : MODE_LABEL[mode]} disabled={disabled} title={disabled ? MODE_LABEL[mode] : `${prefix}${MODE_LABEL[mode]}. Click to cycle.`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (!disabled) onModeCycle?.(); }} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={(event) => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); onModeCycle?.(); } }}>
    <ModulationModeIcon mode={mode} /><span className="sl-slider-mode-text">{MODE_LABEL[mode]}</span>
  </button>;
}
