/**
 * CpuOverlay — tiny fixed dev overlay showing per-worklet CPU %.
 * Toggle via triple-tap on the top-left corner or programmatically.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { audioEngine } from '../audio/engine';

const WORKLET_LABELS: Record<string, string> = {
  'looper-fx': 'Looper',
  'granulator': 'Gran',
  'reverb': 'Reverb',
  'ocean': 'Ocean',
};

const WORKLET_ORDER = ['looper-fx', 'granulator', 'reverb', 'ocean'];

function cpuColor(pct: number): string {
  if (pct < 10) return '#6f6'; // green
  if (pct < 25) return '#ff6'; // yellow
  if (pct < 40) return '#fa4'; // orange
  return '#f44';               // red
}

export const CpuOverlay: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [perfData, setPerfData] = useState<Record<string, number>>({});
  const tapRef = useRef<number[]>([]);

  // Toggle visibility — also enables/disables perf monitoring
  const toggle = useCallback(() => {
    setVisible(prev => {
      const next = !prev;
      audioEngine.setPerfMonitorEnabled(next);
      if (!next) setPerfData({});
      return next;
    });
  }, []);

  // Triple-tap detector for top-left corner
  const handleCornerClick = useCallback(() => {
    const now = Date.now();
    tapRef.current.push(now);
    // Keep last 3 taps
    if (tapRef.current.length > 3) tapRef.current.shift();
    // Check if 3 taps within 800ms
    if (tapRef.current.length === 3 && now - tapRef.current[0] < 800) {
      tapRef.current = [];
      toggle();
    }
  }, [toggle]);

  // Subscribe to perf updates
  useEffect(() => {
    if (!visible) return;
    audioEngine.setPerfUpdateCallback(setPerfData);
    return () => {
      audioEngine.setPerfUpdateCallback(null);
    };
  }, [visible]);

  // Keyboard shortcut: Ctrl+Shift+P
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyP') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggle]);

  const total = Object.values(perfData).reduce((a, b) => a + b, 0);
  const totalRounded = Math.round(total * 10) / 10;
  const hasData = Object.keys(perfData).length > 0;

  return (
    <>
      {/* Invisible tap target in top-left corner */}
      <div
        onClick={handleCornerClick}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 44,
          height: 44,
          zIndex: 99999,
          cursor: 'default',
        }}
      />
      {visible && (
        <div style={styles.container}>
          <div style={styles.header}>
            CPU
            <span style={{ color: cpuColor(totalRounded), marginLeft: 6 }}>
              {totalRounded}%
            </span>
          </div>
          {hasData ? WORKLET_ORDER.map(key => {
            const pct = perfData[key];
            if (pct === undefined) return null;
            return (
              <div key={key} style={styles.row}>
                <span style={styles.label}>{WORKLET_LABELS[key] || key}</span>
                <span style={{ ...styles.value, color: cpuColor(pct) }}>{pct}%</span>
                <div style={styles.barBg}>
                  <div style={{ ...styles.barFill, width: `${Math.min(100, pct)}%`, background: cpuColor(pct) }} />
                </div>
              </div>
            );
          }) : (
            <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>waiting for data…</div>
          )}
        </div>
      )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 8,
    left: 8,
    background: 'rgba(0,0,0,0.85)',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '6px 10px',
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#ccc',
    zIndex: 99998,
    pointerEvents: 'none',
    minWidth: 120,
    backdropFilter: 'blur(4px)',
  },
  header: {
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 4,
    borderBottom: '1px solid #444',
    paddingBottom: 3,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 16,
  },
  label: {
    width: 48,
    color: '#999',
    flexShrink: 0,
  },
  value: {
    width: 38,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  barBg: {
    flex: 1,
    height: 4,
    background: '#222',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
};
