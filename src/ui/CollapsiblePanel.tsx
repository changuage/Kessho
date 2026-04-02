import React from 'react';

export interface CollapsiblePanelProps {
  id: string;
  title: string;
  titleColor?: string;
  titleStyle?: React.CSSProperties;
  headerAction?: React.ReactNode;
  isMobile: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  borderRadius: '12px',
  padding: '15px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  overflow: 'hidden',
  maxWidth: '100%',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 'bold',
  marginBottom: '15px',
  color: '#a5c4d4',
};

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  id,
  title,
  titleColor,
  titleStyle,
  headerAction,
  isMobile,
  isExpanded,
  onToggle,
  children,
}) => {
  const showContent = !isMobile || isExpanded;

  return (
    <div className="app-panel" style={panelStyle}>
      <h3
        className="app-panel-title"
        style={{
          ...panelTitleStyle,
          ...(titleColor ? { color: titleColor } : {}),
          ...titleStyle,
          cursor: isMobile ? 'pointer' : undefined,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: isMobile ? 'none' as const : undefined,
        }}
        onClick={isMobile ? () => onToggle(id) : undefined}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {title}
          {headerAction}
        </span>
        {isMobile && (
          <span style={{
            fontSize: '0.9rem',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>
            ▼
          </span>
        )}
      </h3>
      {showContent && children}
    </div>
  );
};
