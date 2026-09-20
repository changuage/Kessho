import type { JourneyConfig, JourneyState } from '../audio/journeyTypes';

const colors = {
  background: 'rgba(20, 20, 35, 0.5)',
  border: 'rgba(232, 220, 196, 0.3)',
  muted: 'rgba(232, 220, 196, 0.5)',
  playing: '#7B9A6D',
  morphing: '#B8E0FF',
  ending: 'rgba(220, 235, 255, 0.7)',
};

export function JourneyStatusPill({ state, config }: { state: JourneyState; config: JourneyConfig }) {
  const current = config.nodes.find((node) => node.id === state.currentNodeId);
  const next = config.nodes.find((node) => node.id === state.nextNodeId);
  const morphing = state.phase === 'morphing' && next;
  const ending = state.phase === 'ending';
  const color = morphing ? colors.morphing : ending ? colors.ending : current?.color || colors.playing;
  const progress = morphing || ending ? state.morphProgress : state.phraseProgress;

  return (
    <div style={{
      position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20,
      background: colors.background, border: `1px solid ${colors.border}`,
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)', pointerEvents: 'none',
      fontFamily: "'Avenir', 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontSize: 10, color, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
        {morphing ? `${current?.presetName || '?'} → ${next.presetName || '?'}` : ending ? 'Ending' : current?.presetName || 'Journey'}
      </span>
      <span style={{ width: 40, height: 3, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.15)' }}>
        <span style={{ display: 'block', width: `${Math.max(0, Math.min(1, progress)) * 100}%`, height: '100%', background: color }} />
      </span>
      {morphing && <span style={{ fontSize: 9, color: colors.muted }}>{Math.round(state.morphProgress * 100)}%</span>}
    </div>
  );
}
