import type { HarmonyProjection } from '../../audio/harmony/harmonyProjection';
import type { ResolvedHarmonyFrame } from '../../audio/CoreProductHarmonyControl';
import type { HarmonyWorkspaceView } from './harmonyWorkspaceState';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function noteName(value: number): string {
  return NOTE_NAMES[((Math.round(value) % 12) + 12) % 12] ?? 'C';
}

function frameLabel(frame: ResolvedHarmonyFrame): string {
  const quality = frame.quality === 'auto' ? 'Auto' : frame.quality;
  return `${noteName(frame.rootMidi)} ${quality}`;
}

function liveScopeLabel(scope: unknown): string {
  if (!scope || typeof scope !== 'object') return 'None';
  const kind = (scope as { kind?: unknown }).kind;
  if (typeof kind !== 'string') return 'Live';
  if (kind === 'harmony-takeover') return 'Harmony takeover';
  if (kind === 'draft-live') return 'Draft';
  if (kind === 'seq-live') return 'Seq live';
  return kind;
}

function sourceLabel(source: HarmonyProjection['underlyingFrame']['activeSource']): string {
  if (source === 'manualControl') return 'Manual';
  if (source === 'slot') return 'Slot';
  if (source === 'presetMorph') return 'Morph';
  if (source === 'baseline') return 'Auto Harmony';
  return source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Harmony';
}

function trackLabel(projection: HarmonyProjection): string {
  return `${sourceLabel(projection.underlyingFrame.activeSource)} · ${frameLabel(projection.underlyingFrame)}`;
}

export interface HarmonyWorkspaceHeaderProps {
  projection: HarmonyProjection;
  view: HarmonyWorkspaceView;
  onViewChange: (view: HarmonyWorkspaceView) => void;
  morphReadOnly?: boolean;
}

export interface HarmonyWorkspaceHeaderModel {
  home: string;
  track: string;
  effective: string;
  position: string;
  scope: string;
}

export function deriveHarmonyWorkspaceHeader(projection: HarmonyProjection): HarmonyWorkspaceHeaderModel {
  const position = projection.position.eventIndex >= 0
    ? `${projection.position.eventIndex + 1}/${Math.max(1, projection.progression.length)} · bar ${projection.position.barInEvent + 1}`
    : '—';
  return {
    home: `${noteName(projection.engine.homeRootNote)} · ${projection.engine.homeScaleName}`,
    track: trackLabel(projection),
    effective: frameLabel(projection.activeFrame),
    position,
    scope: liveScopeLabel(projection.activeLiveInputScope ?? projection.liveLayer?.scope),
  };
}

export function HarmonyWorkspaceHeader({ projection, view, onViewChange, morphReadOnly = false }: HarmonyWorkspaceHeaderProps) {
  const header = deriveHarmonyWorkspaceHeader(projection);
  return (
    <header className="harmony-workspace-header">
      <div className="harmony-workspace-context" aria-label="Harmony context">
        <div><span>Home</span><strong>{header.home}</strong></div>
        <div><span>Track</span><strong>{header.track}</strong></div>
        <div><span>Effective</span><strong>{header.effective}</strong></div>
        <div><span>Position</span><strong>{header.position}</strong></div>
        <div><span>Live scope</span><strong>{header.scope}</strong></div>
      </div>
      {morphReadOnly && <div className="harmony-workspace-morph-banner" role="status">Morph in progress · Harmony is read-only</div>}
      <nav className="harmony-workspace-tabs" aria-label="Harmony views">
        {(['simple', 'detail', 'overview'] as const).map((item) => (
          <button key={item} type="button" className={view === item ? 'active' : ''} aria-current={view === item ? 'page' : undefined} onClick={() => onViewChange(item)}>
            {item[0]!.toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
    </header>
  );
}
