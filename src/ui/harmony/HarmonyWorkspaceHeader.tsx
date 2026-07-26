import type { HarmonyProjection } from '../../audio/harmony/harmonyProjection';
import type { ResolvedHarmonyFrame } from '../../audio/CoreProductHarmonyControl';
import type { HarmonyWorkspaceView } from './harmonyWorkspaceState';
import type { TonalContextDisplay } from '../../audio/harmony/tonalContextAnalysis';

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
  tonalContext?: TonalContextDisplay | null;
  adoption?: {
    targetLabel: string | null;
    mode: 'playing' | 'preview' | null;
    active: boolean;
    onAdopt: () => void;
    onCancel: () => void;
    disabled?: boolean;
  };
}

export interface HarmonyWorkspaceHeaderModel {
  home: string;
  track: string;
  effective: string;
  position: string;
  scope: string;
  tonal?: { engine: string; context: string; mode: 'playing' | 'preview' };
  adoption?: { target: string; mode: 'playing' | 'preview'; active: boolean };
}

function tonalLabel(context: TonalContextDisplay): { engine: string; context: string; mode: 'playing' | 'preview' } {
  const engine = `${noteName(context.engine.rootPitchClass)} · ${context.engine.scaleName ?? `Scale ${context.engine.scaleId}`}`;
  const preview = context.preview?.top ? context.preview : null;
  const selected = preview ?? context.playing;
  const mode = preview ? 'preview' : 'playing';
  const candidate = selected.top;
  return {
    engine,
    mode,
    context: candidate
      ? `${noteName(candidate.rootPitchClass)} ${candidate.scaleName} · ${Math.round(candidate.confidence * 100)}%`
      : 'Insufficient evidence',
  };
}

export function deriveHarmonyWorkspaceHeader(projection: HarmonyProjection, tonalContext?: TonalContextDisplay | null, adoption?: HarmonyWorkspaceHeaderProps['adoption']): HarmonyWorkspaceHeaderModel {
  const position = projection.position.eventIndex >= 0
    ? `${projection.position.eventIndex + 1}/${Math.max(1, projection.progression.length)} · bar ${projection.position.barInEvent + 1}`
    : '—';
  return {
    home: `${noteName(projection.engine.homeRootNote)} · ${projection.engine.homeScaleName}`,
    track: trackLabel(projection),
    effective: frameLabel(projection.activeFrame),
    position,
    scope: liveScopeLabel(projection.activeLiveInputScope ?? projection.liveLayer?.scope),
    ...(tonalContext ? { tonal: tonalLabel(tonalContext) } : {}),
    ...(adoption?.targetLabel && adoption.mode ? { adoption: { target: adoption.targetLabel, mode: adoption.mode, active: adoption.active } } : {}),
  };
}

export function HarmonyWorkspaceHeader({ projection, view, onViewChange, morphReadOnly = false, tonalContext = null, adoption }: HarmonyWorkspaceHeaderProps) {
  const header = deriveHarmonyWorkspaceHeader(projection, tonalContext, adoption);
  return (
    <header className="harmony-workspace-header">
      <div className="harmony-workspace-context" aria-label="Harmony context">
        <div><span>Home</span><strong>{header.home}</strong></div>
        <div><span>Track</span><strong>{header.track}</strong></div>
        <div><span>Effective</span><strong>{header.effective}</strong></div>
        <div><span>Position</span><strong>{header.position}</strong></div>
        <div><span>Live scope</span><strong>{header.scope}</strong></div>
        {header.tonal && <div aria-label="Tonal context"><span>Engine</span><strong>{header.tonal.engine}</strong><span>{header.tonal.mode === 'preview' ? 'Preview' : 'Playing'}</span><strong>{header.tonal.context}</strong></div>}
      </div>
      {morphReadOnly && <div className="harmony-workspace-morph-banner" role="status">Morph in progress · Harmony is read-only</div>}
      {adoption?.targetLabel && adoption.mode && <div className="harmony-workspace-adoption" role="status">
        <span>{adoption.active ? `Adopting ${adoption.targetLabel} at Harmony boundaries` : `Advisory ${adoption.mode}: ${adoption.targetLabel}`}</span>
        <button type="button" onClick={adoption.active ? adoption.onCancel : adoption.onAdopt} disabled={adoption.disabled}>{adoption.active ? 'Cancel' : 'Adopt'}</button>
      </div>}
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
