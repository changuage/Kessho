import React from 'react';

interface SeqSparklineProps {
  values: number[];
  color: string;
  label: string;
  steps: number;
  playhead?: number;
  /** Hit count for sub-lane playhead (Elektron-style) */
  hitCount?: number;
  /** Sub-lane direction for playhead calculation */
  direction?: 'forward' | 'reverse' | 'pingpong';
  bipolar?: boolean;
  invertFill?: boolean;
  enabled?: boolean;
  onClick?: () => void;
  onToggleEnabled?: () => void;
  expanded?: boolean;
}

const SeqSparkline: React.FC<SeqSparklineProps> = ({ values, color, label, steps, playhead = -1, hitCount = 0, direction = 'forward', bipolar = false, invertFill = false, enabled = true, onClick, onToggleEnabled, expanded = false }) => {
  const width = 200;
  const height = 20;
  const count = 16; // always 16 slots
  const barW = width / count;

  // Sub-lane sparkline playhead: derived from hitCount (Elektron-style)
  const subPlayhead = (() => {
    if (playhead < 0) return -1;
    const basis = hitCount;
    let idx = ((basis % steps) + steps) % steps;
    if (direction === 'reverse') {
      idx = steps - 1 - idx;
    } else if (direction === 'pingpong') {
      const cycle = steps > 1 ? steps * 2 - 2 : 1;
      const p = ((basis % cycle) + cycle) % cycle;
      idx = p < steps ? p : cycle - p;
    }
    return idx;
  })();

  return (
    <div className={`seq-spark-strip${expanded ? ' expanded' : ''}${!enabled ? ' disabled' : ''}`} onClick={onClick}>
      <span
        className="seq-spark-badge"
        style={{ '--lane-color': color } as React.CSSProperties}
        onClick={(e) => { if (onToggleEnabled) { e.stopPropagation(); onToggleEnabled(); } }}
      >
        <span className="seq-spark-badge-label">{label}</span>
        <span className="seq-spark-badge-steps">{steps}</span>
      </span>
      <div className="seq-spark-svg-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {/* Beat grid lines every 4 steps */}
          {[1, 2, 3].map((b) => (
            <line key={`g${b}`} x1={b * (width / 4)} y1={0} x2={b * (width / 4)} y2={height} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
          ))}

          {bipolar && (
            /* Dashed center line for bipolar sparklines */
            <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} strokeDasharray="2,2" />
          )}

          {invertFill && (
            /* Faint dashed baseline at top for inverted expression */
            <line x1={0} y1={1} x2={width} y2={1} stroke={color} strokeWidth={0.3} strokeOpacity={0.25} strokeDasharray="2,3" />
          )}

          {values.map((rawV, i) => {
            const inRange = i < steps;
            const v = Math.max(0, Math.min(1, rawV));
            const x = i * barW + 1;
            const w = Math.max(1, barW - 2);

            if (bipolar) {
              const deviation = v - 0.5;
              if (Math.abs(deviation) < 0.01) return null;
              const midY = height / 2;
              const opacity = inRange ? Math.min(1, 0.25 + Math.abs(deviation) * 1.4) : 0.06;
              if (deviation > 0) {
                const barH = Math.min(deviation * (height - 2), midY - 1);
                return <rect key={i} x={x} y={midY - barH} width={w} height={barH} rx={0.8} fill={color} opacity={opacity} />;
              } else {
                const barH = Math.min(Math.abs(deviation) * (height - 2), midY - 1);
                return <rect key={i} x={x} y={midY} width={w} height={barH} rx={0.8} fill={color} opacity={opacity} />;
              }
            }

            if (invertFill) {
              // Bars hang from top — deficit from 100%
              const deficit = 1 - v;
              if (deficit < 0.01 && inRange) {
                const hiOpacity = 0.35 + v * 0.65;
                return <rect key={i} x={x} y={0.5} width={w} height={1} rx={0.6} fill={color} opacity={hiOpacity} />;
              }
              const barH = deficit * (height - 2);
              const opacity = inRange ? (0.08 + v * 0.82) : 0.04;
              return <rect key={i} x={x} y={1} width={w} height={barH} rx={0.8} fill={color} opacity={opacity} />;
            }

            // Normal bottom-up bars
            if (v < 0.01 && inRange) return null;
            const barH = v * (height - 2);
            const barY = height - barH;
            const opacity = inRange ? (0.25 + v * 0.6) : 0.06;
            return <rect key={i} x={x} y={barY} width={w} height={barH} rx={0.8} fill={color} opacity={opacity} />;
          })}

          {subPlayhead >= 0 && (
            <rect
              className="spark-playhead"
              x={Math.round((subPlayhead % count) * barW)}
              y={0}
              width={Math.max(1, Math.floor(barW))}
              height={height}
              fill={color}
              opacity={0.35}
            />
          )}
        </svg>
      </div>
      <span className="seq-spark-expand">{expanded ? '▾' : '▸'}</span>
    </div>
  );
};

export default SeqSparkline;
