import React from 'react';

export function SliderContextControl({ config, label, open, onToggle }: { config: React.ReactNode; label: string; open: boolean; onToggle: () => void }) {
  return <span className="sl-slider-context">
    <button type="button" className="sl-slider-context-button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={label} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(); }}>
      <svg className="sl-slider-context-icon" viewBox="0 0 16 16" focusable="false" aria-hidden="true">
        <path d="M2 4h12M2 8h12M2 12h12" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <circle cx="6" cy="4" r="1.45" fill="currentColor" /><circle cx="10" cy="8" r="1.45" fill="currentColor" /><circle cx="5" cy="12" r="1.45" fill="currentColor" />
      </svg>
    </button>
    {open && <div className="sl-slider-context-panel" role="dialog" aria-label={label}>{config}</div>}
  </span>;
}
