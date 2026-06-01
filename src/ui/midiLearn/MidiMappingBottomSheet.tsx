import type { CSSProperties, ReactNode } from 'react';

export type MidiMappingBottomSheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export type MidiMappingBottomSheetProps = {
  open: boolean;
  title: string;
  sourceLabel?: string;
  targetLabel?: string;
  rangeLabel?: string;
  curveLabel?: string;
  enabled?: boolean;
  children?: ReactNode;
  actions?: MidiMappingBottomSheetAction[];
  onClose: () => void;
};

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 90,
  background: 'rgba(0, 0, 0, 0.42)',
};

const sheetStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 91,
  maxHeight: 'min(72vh, 560px)',
  overflow: 'auto',
  padding: '14px max(16px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
  borderTop: '1px solid rgba(255, 255, 255, 0.12)',
  background: '#12161b',
  color: '#f6f8fb',
  boxShadow: '0 -16px 44px rgba(0, 0, 0, 0.36)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  minHeight: 44,
  alignItems: 'center',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  fontSize: 14,
};

const buttonStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 6,
  border: '1px solid rgba(255, 255, 255, 0.16)',
  background: 'rgba(255, 255, 255, 0.08)',
  color: '#f6f8fb',
};

export function MidiMappingBottomSheet({
  open,
  title,
  sourceLabel,
  targetLabel,
  rangeLabel,
  curveLabel,
  enabled,
  children,
  actions = [],
  onClose,
}: MidiMappingBottomSheetProps) {
  if (!open) return null;

  return (
    <>
      <button
        aria-label="Close MIDI mapping editor"
        type="button"
        style={backdropStyle}
        onClick={onClose}
      />
      <section
        aria-modal="true"
        role="dialog"
        aria-label={title}
        style={sheetStyle}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 650 }}>{title}</h2>
          <button type="button" style={buttonStyle} onClick={onClose}>Done</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {sourceLabel ? <div style={rowStyle}><span>Source</span><strong>{sourceLabel}</strong></div> : null}
          {targetLabel ? <div style={rowStyle}><span>Target</span><strong>{targetLabel}</strong></div> : null}
          {rangeLabel ? <div style={rowStyle}><span>Range</span><strong>{rangeLabel}</strong></div> : null}
          {curveLabel ? <div style={rowStyle}><span>Curve</span><strong>{curveLabel}</strong></div> : null}
          {typeof enabled === 'boolean' ? <div style={rowStyle}><span>Status</span><strong>{enabled ? 'Enabled' : 'Bypassed'}</strong></div> : null}
        </div>
        {children ? <div style={{ marginTop: 14 }}>{children}</div> : null}
        {actions.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                style={{
                  ...buttonStyle,
                  color: action.destructive ? '#ffb4b4' : buttonStyle.color,
                }}
                disabled={action.disabled}
                onClick={action.onPress}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
