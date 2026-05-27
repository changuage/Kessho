/**
 * CpuOverlay — tiny fixed dev overlay showing per-worklet CPU %.
 * Toggle via triple-tap on the top-left corner or programmatically.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useVisibleInterval } from './hooks/useVisibleInterval';

type PerfMetrics = {
  avgPercent: number;
  peakPercent: number;
  missPercent: number | null;
  scope?: 'worklet' | 'source';
};

export type CpuOverlayPerfCallback = (data: Record<string, PerfMetrics>) => void;

export type CpuOverlayProps = {
  setPerfMonitorEnabled: (enabled: boolean) => void;
  setPerfUpdateCallback: (callback: CpuOverlayPerfCallback | null) => void;
};

const WORKLET_LABELS: Record<string, string> = {
  // WASM engines
  'reverb-wasm': 'Reverb',
  'dynamics-character': 'Dynamics',
  'lead-fm-wasm': 'Lead FM',
  'pad-wasm': 'Pad',
  'drum-wasm': 'Drums',
  'granular-fx-wasm': 'Granular',
  'spectral-freeze-wasm': 'Freeze',
  'soundscapes-wasm': 'Earth DSP',
  // Soundscapes sub-engines/source detail
  'water': 'Water',
  'insects-1': 'Insects 1',
  'insects-2': 'Insects 2',
};

/** Preferred display order */
const DISPLAY_ORDER = [
  // FX group
  'reverb-wasm', 'spectral-freeze-wasm', 'granular-fx-wasm', 'dynamics-character',
  // Instrument group
  'lead-fm-wasm', 'pad-wasm', 'drum-wasm',
  // Soundscapes group
  'soundscapes-wasm', 'water', 'insects-1', 'insects-2',
];

function cpuColor(pct: number): string {
  if (pct < 10) return '#6f6'; // green
  if (pct < 25) return '#ff6'; // yellow
  if (pct < 40) return '#fa4'; // orange
  return '#f44';               // red
}

export const CpuOverlay: React.FC<CpuOverlayProps> = ({
  setPerfMonitorEnabled,
  setPerfUpdateCallback,
}) => {
  const [visible, setVisible] = useState(false);
  const [displayPerfData, setDisplayPerfData] = useState<Record<string, PerfMetrics>>({});
  const tapRef = useRef<number[]>([]);
  const latestPerfRef = useRef<Record<string, PerfMetrics>>({});

  // Toggle visibility — also enables/disables perf monitoring
  const toggle = useCallback(() => {
    setVisible(prev => {
      const next = !prev;
      setPerfMonitorEnabled(next);
      if (!next) {
        setPerfUpdateCallback(null);
        latestPerfRef.current = {};
        setDisplayPerfData({});
      }
      return next;
    });
  }, [setPerfMonitorEnabled, setPerfUpdateCallback]);

  // Triple-tap detector for top-left corner
  const handleCornerClick = useCallback(() => {
    const now = Date.now();
    tapRef.current.push(now);
    // Keep last 3 taps
    if (tapRef.current.length > 3) tapRef.current.shift();
    // Check if 3 taps within 800ms
    if (tapRef.current.length === 3 && now - (tapRef.current[0] ?? now) < 800) {
      tapRef.current = [];
      toggle();
    }
  }, [toggle]);

  // Collect latest perf data from worklets and publish to state once per second.
  useEffect(() => {
    if (!visible) return;
    setPerfUpdateCallback((data) => {
      latestPerfRef.current = data;
    });
    return () => {
      setPerfUpdateCallback(null);
    };
  }, [setPerfUpdateCallback, visible]);

  useVisibleInterval(() => {
    const snap = latestPerfRef.current;
    if (Object.keys(snap).length === 0) return;
    const out: Record<string, PerfMetrics> = {};
    for (const key of DISPLAY_ORDER) {
      out[key] = snap[key] ?? { avgPercent: 0, peakPercent: 0, missPercent: 0 };
    }
    for (const key of Object.keys(snap)) {
      const metrics = snap[key];
      if (!(key in out) && metrics) out[key] = metrics;
    }
    setDisplayPerfData(out);
  }, 2000, {
    enabled: visible,
  });

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

  const primaryMetrics = Object.values(displayPerfData).filter((entry) => entry.scope !== 'source');
  const headerAvg = primaryMetrics.reduce((sum, entry) => sum + entry.avgPercent, 0);
  const headerPeak = primaryMetrics.reduce((maxPeak, entry) => Math.max(maxPeak, entry.peakPercent), 0);
  const hasData = Object.keys(displayPerfData).length > 0;

  // Any unknown keys not in display order
  const extraKeys = Object.keys(displayPerfData).filter(k => !DISPLAY_ORDER.includes(k));

  const formatPercent = (value: number | null) => value === null ? 'n/a' : `${value.toFixed(1)}%`;

  const renderRow = (key: string) => {
    const metrics = displayPerfData[key] ?? { avgPercent: 0, peakPercent: 0, missPercent: 0 };
    return (
      <div key={key} style={styles.row}>
        <span style={styles.label}>{WORKLET_LABELS[key] || key}</span>
        <span style={{ ...styles.value, color: cpuColor(metrics.avgPercent) }}>
          {formatPercent(metrics.avgPercent)}
        </span>
        <span style={{ ...styles.value, color: cpuColor(metrics.peakPercent) }}>
          {formatPercent(metrics.peakPercent)}
        </span>
        <span style={{ ...styles.missValue, color: metrics.missPercent === null ? '#777' : cpuColor(metrics.missPercent) }}>
          {formatPercent(metrics.missPercent)}
        </span>
        <div style={styles.barBg}>
          <div style={{ ...styles.barFill, width: `${Math.min(100, metrics.peakPercent)}%`, background: cpuColor(metrics.peakPercent) }} />
        </div>
      </div>
    );
  };

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
            <span>CPU</span>
            <span style={{ ...styles.headerMetric, color: cpuColor(headerAvg) }}>
              avg {headerAvg.toFixed(1)}% / peak {headerPeak.toFixed(1)}%
            </span>
          </div>
          <div style={styles.columns}>
            <span style={styles.label}>Engine</span>
            <span style={styles.columnLabel}>Avg</span>
            <span style={styles.columnLabel}>Peak</span>
            <span style={styles.missColumnLabel}>Miss</span>
            <span style={styles.barColumnLabel}>Bar</span>
          </div>
          {hasData ? (
            <>
              {DISPLAY_ORDER.map(renderRow)}
              {extraKeys.map(renderRow)}
            </>
          ) : (
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
    minWidth: 270,
    backdropFilter: 'blur(4px)',
  },
  header: {
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 4,
    display: 'flex',
    justifyContent: 'space-between',
    borderBottom: '1px solid #444',
    paddingBottom: 3,
  },
  headerMetric: {
    fontWeight: 'normal',
  },
  columns: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#777',
    fontSize: 10,
    marginBottom: 2,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 16,
  },
  label: {
    width: 78,
    color: '#999',
    flexShrink: 0,
  },
  value: {
    width: 46,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  missValue: {
    width: 44,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  columnLabel: {
    width: 46,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  missColumnLabel: {
    width: 44,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  barColumnLabel: {
    flex: 1,
    textAlign: 'left' as const,
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
