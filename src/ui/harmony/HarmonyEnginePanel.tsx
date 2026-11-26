import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SliderState } from '../state';
import { useSliderHelp } from '../SliderHelpOverlay';
import type { HarmonyState } from '../../audio/harmony';
import { type HarmonyLiveLayer, type HarmonyLiveLayerChangeHandler, type HarmonyProjection } from '../../audio/harmony/harmonyProjection';
import { SCALE_FAMILIES } from '../../audio/scales';
import type { ProductManualSynthNote, ProductManualSynthSource } from '../../audio/product/ProductEngineTypes';
import type { ProductLiveNoteEvent } from '../../audio/product/liveNoteEvents';
import {
  defaultHarmonyIntent,
  resolveHarmonyIntentToNotePool,
  sanitizeHarmonyIntent,
  type HarmonyProgression,
  sanitizeManualHarmonyControl,
  type HarmonyBassMode,
  type HarmonyChordQuality,
  type HarmonyControlStrength,
  type HarmonyIntent,
  type ManualHarmonyControlMode,
  type ManualHarmonyControlState,
  type ResolvedHarmonyFrame,
} from '../../audio/CoreProductHarmonyControl';
import { DEFAULT_HARMONY_SCALE_INTERVALS, HARMONY_SCALE_INTERVALS } from '../../audio/harmony/harmonyScaleIntervals';
import './HarmonyEnginePanel.css';
import LiveChordKeyboard from './live/LiveChordKeyboard';
import useHarmonySuggestions from './useHarmonySuggestions';
import SuggestionGrid from './shared/SuggestionGrid';
import HarmonyOverviewSurface from './HarmonyOverviewSurface';
import { useLiveNoteInput } from '../keyboard/liveNoteInput';
import { harmonyPerformanceBankIndex, harmonyPerformanceBankTrigger } from './harmonyPerformanceBank';
import { readHarmonyAuditionSource, writeHarmonyAuditionSource } from './harmonyAuditionPreference';
import { harmonyAuditionVelocity } from './harmonyAuditionLevel';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const ROMAN_DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

const QUALITY_OPTIONS: readonly { value: HarmonyChordQuality; label: string; key?: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'dim', label: 'Dim', key: 'I' },
  { value: 'min', label: 'Min', key: 'O' },
  { value: 'maj', label: 'Maj', key: 'P' },
  { value: 'sus', label: 'Sus', key: '[' },
  { value: 'min7', label: 'm7' },
  { value: 'maj7', label: 'M7' },
  { value: 'dom7', label: '7' },
  { value: 'add9', label: 'add9' },
  { value: 'six', label: '6' },
  { value: 'sixNine', label: '6/9' },
  { value: 'nine', label: '9' },
  { value: 'quartal', label: 'Quartal' },
  { value: 'cluster', label: 'Cluster' },
];

const QUICK_QUALITY_KEYS: Record<string, HarmonyChordQuality> = {
  i: 'dim',
  o: 'min',
  p: 'maj',
  '[': 'sus',
};

const EXTENSION_KEYS: readonly { value: string; label: string; key: string }[] = [
  { value: 'six', label: '6', key: 'K' },
  { value: 'min7', label: 'm7', key: 'L' },
  { value: 'maj7', label: 'M7', key: ';' },
  { value: 'nine', label: '9', key: "'" },
];

const QUALITY_TITLE_LABELS: Readonly<Record<HarmonyChordQuality, string>> = {
  auto: 'Auto',
  dim: 'Dim',
  min: 'Min',
  maj: 'Maj',
  sus: 'Sus',
  maj7: 'M7',
  min7: 'm7',
  dom7: '7',
  add9: 'add9',
  six: '6',
  sixNine: '6/9',
  nine: '9',
  quartal: 'Quartal',
  cluster: 'Cluster',
  custom: 'Custom',
};

const EXTENSION_TITLE_LABELS: Readonly<Record<string, string>> = {
  six: '6',
  min7: 'm7',
  maj7: 'M7',
  dom7: '7',
  add9: '9',
  nine: '9',
  sixNine: '6/9',
};

const BASS_MODES: readonly { value: HarmonyBassMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'root', label: 'Root' },
  { value: 'fifth', label: 'Fifth' },
];

type HarmonyBank = 'A' | 'B';
const TENSION_CHARACTER_STOPS = [
  { value: 0, label: 'Resolved', description: 'major and pentatonic scales with simple chord shapes' },
  { value: 0.15, label: 'Dreamy', description: 'Lydian and Mixolydian colors with light suspensions' },
  { value: 0.25, label: 'Warm Min', description: 'minor pentatonic and Dorian warmth' },
  { value: 0.35, label: 'Melancholy', description: 'Aeolian minor color' },
  { value: 0.5, label: 'Dramatic', description: 'harmonic and melodic minor color' },
  { value: 0.7, label: 'Unsettled', description: 'mixed color and high-tension scale choices' },
  { value: 0.9, label: 'High', description: 'octatonic and Phrygian-dominant tension' },
] as const;

const AUDITION_SOURCE_OPTIONS: readonly { value: ProductManualSynthSource; label: string }[] = [
  { value: 'pad1', label: 'Pad 1' },
  { value: 'pad2', label: 'Pad 2' },
  { value: 'lead1', label: 'Lead 1' },
  { value: 'lead2', label: 'Lead 2' },
  { value: 'sample1', label: 'Sample 1' },
] as const;

export interface HarmonyEnginePanelProps {
  state: SliderState;
  harmonyState?: HarmonyState | null;
  /** Shared read-only Harmony context supplied by the runtime host. */
  harmonyProjection: HarmonyProjection;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  onAuditionNote?: (note: ProductManualSynthNote) => void;
  onAuditionNotes?: (notes: readonly ProductManualSynthNote[]) => Promise<void>;
  onLiveNoteStart?: (event: ProductLiveNoteEvent) => Promise<void>;
  onLiveNoteStop?: (event: ProductLiveNoteEvent) => void;
  onTransientStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  workspaceView?: 'simple' | 'detail' | 'overview';
  onHarmonyLiveLayerChange?: HarmonyLiveLayerChangeHandler;
  isRunning?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pitchClass(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

function midiNoteName(value: number): string {
  const safe = clamp(Math.round(value), 0, 127);
  const note = NOTE_NAMES[safe % 12] ?? 'C';
  const octave = Math.floor(safe / 12) - 1;
  return `${note}${octave}`;
}

function noteName(value: number): string {
  return NOTE_NAMES[pitchClass(value)] ?? 'C';
}

function sourceLabel(source: ResolvedHarmonyFrame['activeSource'] | null): string {
  if (!source) return 'None';
  if (source === 'baseline') return 'Auto Harmony';
  if (source === 'manualControl') return 'Manual';
  if (source === 'presetMorph') return 'Morph';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function tensionCharacterFor(value: number): typeof TENSION_CHARACTER_STOPS[number] {
  const tension = clamp(value, 0, 1);
  return TENSION_CHARACTER_STOPS.reduce((best, item) => (
    Math.abs(item.value - tension) < Math.abs(best.value - tension) ? item : best
  ), TENSION_CHARACTER_STOPS[0]!);
}

function tensionScaleBandLabel(value: number): string {
  const tension = clamp(value, 0, 1);
  if (tension <= 0.1) return 'Major / Pent';
  if (tension <= 0.2) return 'Lydian / Mix';
  if (tension <= 0.3) return 'Min Pent / Dorian';
  if (tension <= 0.4) return 'Aeolian';
  if (tension <= 0.55) return 'Harm / Mel Min';
  if (tension <= 0.8) return 'Mixed High';
  return 'Oct / Phrygian';
}

function tensionChordBandLabel(value: number): string {
  const chordTension = (clamp(value, 0, 1) % 0.5) * 2;
  if (chordTension < 0.2) return 'Triads';
  if (chordTension < 0.4) return 'Sus / triads';
  if (chordTension < 0.6) return '7ths';
  if (chordTension < 0.8) return '9ths / add';
  return 'Clusters';
}

function intentTitle(intent: HarmonyIntent | null | undefined): string {
  if (!intent) return 'Empty';
  const root = intent.rootMode === 'degree'
    ? ROMAN_DEGREES[clamp(intent.degree, 0, 6)] ?? 'I'
    : noteName(intent.rootNote);
  const quality = QUALITY_TITLE_LABELS[intent.quality] ?? intent.quality;
  const extensions = intent.extensions
    .map((extension) => EXTENSION_TITLE_LABELS[extension] ?? extension)
    .filter((extension) => extension !== quality);
  return [root, quality, ...extensions].join(' ');
}

function statePatch(patch: Record<string, unknown>): SliderState {
  return patch as unknown as SliderState;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return ['text', 'search', 'email', 'url', 'tel', 'number', 'password'].includes(target.type);
}

function releaseFocusedHarmonyControl(target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) return;
  if (target.matches('button, select, summary, [role="button"], [tabindex]')) target.blur();
}

function progressionKey(bank: HarmonyBank): 'harmonyProgressionA' | 'harmonyProgressionB' {
  return bank === 'B' ? 'harmonyProgressionB' : 'harmonyProgressionA';
}

function modeForIntentUpdate(mode: ManualHarmonyControlMode, manualLocked: boolean): ManualHarmonyControlMode {
  if (manualLocked && mode !== 'audition') return 'audition';
  return mode;
}

function auditionNoteLimit(source: ProductManualSynthSource): number {
  if (source === 'lead1' || source === 'lead2') return 1;
  return source === 'sample1' || source === 'sample2' ? 8 : 6;
}

function auditionDurationMs(source: ProductManualSynthSource): number {
  if (source === 'lead1' || source === 'lead2') return 720;
  return source === 'sample1' || source === 'sample2' ? 1300 : 1600;
}

function frameChordTitle(frame: ResolvedHarmonyFrame): string {
  return intentTitle({ ...defaultHarmonyIntent(frame.activeSource, frame.degree), quality: frame.quality });
}

function HarmonyNotePoolPills({ notes, compact = false }: { notes: readonly number[]; compact?: boolean }) {
  return (
    <div className={`harmony-note-pills${compact ? ' compact' : ''}`}>
      {notes.length > 0 ? notes.slice(0, compact ? 6 : 8).map((note) => (
        <span key={note}>{midiNoteName(note)}</span>
      )) : (
        <span className="empty">None</span>
      )}
    </div>
  );
}

function HarmonySourceBadge({ source }: { source: ResolvedHarmonyFrame['activeSource'] | null }) {
  return <span className={`harmony-source-badge source-${source ?? 'none'}`}>{sourceLabel(source)}</span>;
}

function harmonyHelpAttrs(helpKey: string, label?: string): Record<string, string> {
  return label
    ? { 'data-harmony-help-key': helpKey, 'data-harmony-help-label': label }
    : { 'data-harmony-help-key': helpKey };
}

function findHarmonyHelpElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('[data-harmony-help-key]');
}

function HarmonyStatusTile({
  label,
  title,
  notes,
  source,
  meta,
  helpKey,
  helpLabel,
  locked = false,
  onClick,
}: {
  label: string;
  title: string;
  notes?: readonly number[];
  source?: ResolvedHarmonyFrame['activeSource'] | null;
  meta?: string;
  helpKey?: string;
  helpLabel?: string;
  locked?: boolean;
  onClick?: () => void;
}) {
  const helpProps = helpKey ? harmonyHelpAttrs(helpKey, helpLabel) : {};
  const body = (
    <>
      <span className="harmony-status-label">{label}</span>
      <strong>{title}</strong>
      {notes ? <HarmonyNotePoolPills notes={notes} compact /> : <em>{meta}</em>}
      {source !== undefined && <HarmonySourceBadge source={source} />}
      {locked && <small>Locked during morph</small>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`harmony-status-tile clickable${locked ? ' locked' : ''}`} onClick={onClick} {...helpProps}>
        {body}
      </button>
    );
  }
  return <div className={`harmony-status-tile${locked ? ' locked' : ''}`} {...helpProps}>{body}</div>;
}

function HarmonySummaryCard({
  bank,
  rootLabel,
  scaleName,
  resolvedFrame,
  manualLocked,
  chordSequenceEnabled,
  tension,
  rootNote,
  scaleMode,
  manualScale,
  onTensionChange,
  onRootNoteChange,
  onScaleModeChange,
  onManualScaleChange,
  showPolicyControls = true,
  suggestionBank = [],
  suggestionAxis,
  onSuggestionPress,
  onSuggestionRelease,
}: {
  bank: HarmonyBank;
  rootLabel: string;
  scaleName: string;
  resolvedFrame: ResolvedHarmonyFrame;
  manualLocked: boolean;
  chordSequenceEnabled: boolean;
  tension: number;
  rootNote: number;
  scaleMode: string;
  manualScale: string;
  onTensionChange?: (tension: number) => void;
  onRootNoteChange?: (rootNote: number) => void;
  onScaleModeChange?: (mode: string) => void;
  onManualScaleChange?: (scale: string) => void;
  showPolicyControls?: boolean;
  suggestionBank?: readonly (import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion | null)[];
  suggestionAxis?: readonly number[];
  onSuggestionPress?: (suggestion: import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion) => void;
  onSuggestionRelease?: (suggestion: import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion) => void;
}) {
  const tensionCharacter = tensionCharacterFor(tension);
  const scaleBand = tensionScaleBandLabel(tension);
  const chordBand = tensionChordBandLabel(tension);
  const controlMeta = manualLocked
    ? 'Manual control locked'
    : resolvedFrame.activeStepIndex !== null
      ? `Step ${resolvedFrame.activeStepIndex + 1} / 8`
      : chordSequenceEnabled
        ? 'Sequence armed'
        : 'Using auto harmony';

  return (
    <div className="harmony-summary-card">
      <div className="harmony-engine-header">
        <div>
          <div className="harmony-engine-title">Chord Harmony</div>
          <div className="harmony-engine-meta">
            {rootLabel} {scaleName} · Bank {bank} · Morph {Math.round(resolvedFrame.morphPercent)}%
          </div>
        </div>
      </div>
      {showPolicyControls && <div className="harmony-tension-strip" title={`Tension still drives scale selection and chord complexity. Scale: ${scaleBand}. Chords: ${chordBand}. Character: ${tensionCharacter.label} (${tensionCharacter.description}).`}>
        <label className="harmony-tension-label" {...harmonyHelpAttrs('harmonyTension')}>
          <span>Tension / Character</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={tension}
            onChange={onTensionChange ? (event) => onTensionChange(Number(event.target.value)) : undefined}
            disabled={!onTensionChange}
          />
          <strong>{Math.round(tension * 100)}%</strong>
        </label>
        <div className="harmony-tension-character" {...harmonyHelpAttrs('harmonyTensionCharacter')}>
          <span>Scale</span>
          <strong>{scaleBand}</strong>
          <span>Chords</span>
          <strong>{chordBand}</strong>
        </div>
        <div className="harmony-tension-stops" aria-label="Tension character stops">
          {TENSION_CHARACTER_STOPS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.label === tensionCharacter.label ? 'active' : ''}
              onClick={onTensionChange ? () => onTensionChange(item.value) : undefined}
              disabled={!onTensionChange}
              title={`${item.label}: ${item.description}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>}
      {showPolicyControls && <div className="harmony-palette-strip">
        <div className="harmony-palette-row">
          <label className="harmony-palette-select" {...harmonyHelpAttrs('harmonyRootNote')}>
            <span>Root</span>
            <select value={rootNote} onChange={onRootNoteChange ? (e) => onRootNoteChange(Number(e.target.value)) : undefined} disabled={!onRootNoteChange}>
              {NOTE_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
            </select>
          </label>
          <label className="harmony-palette-select" {...harmonyHelpAttrs('harmonyScaleMode')}>
            <span>Scale</span>
            <select value={scaleMode} onChange={onScaleModeChange ? (e) => onScaleModeChange(e.target.value) : undefined} disabled={!onScaleModeChange}>
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          {scaleMode === 'manual' && (
            <label className="harmony-palette-select harmony-palette-select--wide" {...harmonyHelpAttrs('harmonyManualScale')}>
              <span>Family</span>
              <select value={manualScale} onChange={onManualScaleChange ? (e) => onManualScaleChange(e.target.value) : undefined} disabled={!onManualScaleChange}>
                {SCALE_FAMILIES.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>}
      {suggestionBank.length > 0 && <div className="harmony-suggestion-dock" aria-label="Harmony suggestions">
        <div className="harmony-suggestion-dock-header"><strong>Suggestions</strong><span>Hold to preview</span></div>
        <SuggestionGrid
          suggestions={suggestionBank.map((suggestion) => suggestion ? { ...suggestion, notes: suggestion.exactMidiNotes, exactMidiNotes: suggestion.exactMidiNotes } : null)}
          axis={suggestionAxis}
          onPress={onSuggestionPress ? (suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) onSuggestionPress(full); } : undefined}
          onRelease={onSuggestionRelease ? (suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) onSuggestionRelease(full); } : undefined}
        />
      </div>}
      <div className="harmony-summary-grid">
        <HarmonyStatusTile
          label="Now"
          title={frameChordTitle(resolvedFrame)}
          notes={resolvedFrame.currentNotePool}
          source={resolvedFrame.activeSource}
          helpKey="harmonySummaryNow"
        />
        <HarmonyStatusTile
          label="Next"
          title={resolvedFrame.nextStepIndex !== null ? `Step ${resolvedFrame.nextStepIndex + 1}` : sourceLabel(resolvedFrame.nextSource)}
          notes={resolvedFrame.nextNotePool}
          source={resolvedFrame.nextSource}
          helpKey="harmonySummaryNext"
        />
        <HarmonyStatusTile
          label="Control"
          title={sourceLabel(resolvedFrame.activeSource)}
          meta={controlMeta}
          locked={manualLocked}
          helpKey="harmonySummaryControl"
        />
      </div>
    </div>
  );
}

function ManualVoicingHeader({
  scaleLabel,
  manualLocked,
  onClear,
  canWriteState,
}: {
  scaleLabel: string;
  manualLocked: boolean;
  onClear: () => void;
  canWriteState: boolean;
}) {
  return (
    <div className="harmony-popup-header">
      <div>
        <span>Manual Voicing</span>
        <small>{scaleLabel}</small>
      </div>
      <button type="button" className="harmony-subtle-button" onClick={onClear} disabled={!canWriteState} {...harmonyHelpAttrs('harmonyManualClear')}>
        Clear
      </button>
      {manualLocked && (
        <div className="harmony-lock-message">
          Manual control is locked during preset morph. Move morph to A or B endpoint.
        </div>
      )}
    </div>
  );
}

function ManualVoicingPreview({
  label,
  notes,
  auditionSource,
  auditionEnabled,
  onAuditionSourceChange,
  onAuditionPreview,
}: {
  label: string;
  notes: readonly number[];
  auditionSource: ProductManualSynthSource;
  auditionEnabled: boolean;
  onAuditionSourceChange: (source: ProductManualSynthSource) => void;
  onAuditionPreview: () => void;
}) {
  return (
    <div className="harmony-manual-preview">
      <span>Preview</span>
      <strong>{label}</strong>
      <div className="harmony-audition-tools" aria-label="Audition sound engine">
        <label {...harmonyHelpAttrs('harmonyManualAuditionSound')} title="Choose which synth voice to preview chords through">
          <span>Sound</span>
          <select
            value={auditionSource}
            onChange={(event) => onAuditionSourceChange(event.target.value as ProductManualSynthSource)}
            disabled={!auditionEnabled}
          >
            {AUDITION_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="harmony-primary-button"
          onClick={onAuditionPreview}
          disabled={!auditionEnabled || notes.length === 0}
          title="Play the current chord selection through the chosen synth voice"
          {...harmonyHelpAttrs('harmonyManualAuditionPlay')}
        >
          Play
        </button>
      </div>
    </div>
  );
}

function ChordModifierPanel({
  manual,
  chordLabel,
  canWriteState,
  onQualityChange,
  onToggleExtension,
}: {
  manual: ManualHarmonyControlState;
  chordLabel: string;
  canWriteState: boolean;
  onQualityChange: (quality: HarmonyChordQuality) => void;
  onToggleExtension: (extension: string) => void;
}) {
  return (
    <div className="harmony-modifier-panel">
      <div className="harmony-chord-type-heading">
        <div className="harmony-panel-label">Chord Type</div>
        <strong>{chordLabel}</strong>
        <p>Root, quality, and extensions define the chord.</p>
      </div>
      <div className="harmony-control-cluster">
        <span>Quality</span>
        <div className="harmony-chip-row">
          {QUALITY_OPTIONS.slice(1, 5).map((quality) => (
            <button
              key={quality.value}
              type="button"
              className={`harmony-chip${manual.selectedQuality === quality.value ? ' active' : ''}`}
              onClick={() => onQualityChange(quality.value)}
              disabled={!canWriteState}
              title={`Set chord quality to ${quality.label}`}
              {...harmonyHelpAttrs('harmonyManualQuality')}
            >
              <em>{quality.key}</em>
              {quality.label}
            </button>
          ))}
        </div>
      </div>
      <div className="harmony-control-cluster">
        <span>Extensions</span>
        <div className="harmony-chip-row">
          {EXTENSION_KEYS.map((extension) => (
            <button
              key={extension.value}
              type="button"
              className={`harmony-chip${manual.selectedExtensions.includes(extension.value) ? ' active' : ''}`}
              onClick={() => onToggleExtension(extension.value)}
              disabled={!canWriteState}
              title={`Toggle ${extension.label} extension`}
              {...harmonyHelpAttrs('harmonyManualExtension')}
            >
              <em>{extension.key}</em>
              {extension.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function VoicingAdvancedDisclosure({
  manual,
  open,
  canWriteState,
  blendWithSequence,
  onToggleOpen,
  onOctaveChange,
  onInversionChange,
  onSpreadChange,
  onBassModeChange,
  onBlendChange,
  route,
  onRouteChange,
}: {
  manual: ManualHarmonyControlState;
  open: boolean;
  canWriteState: boolean;
  blendWithSequence: boolean;
  onToggleOpen: () => void;
  onOctaveChange: (delta: number) => void;
  onInversionChange: (delta: number) => void;
  onSpreadChange: (spread: number) => void;
  onBassModeChange: (bassMode: HarmonyBassMode) => void;
  onBlendChange: (blend: boolean) => void;
  route: 'track' | 'harmony';
  onRouteChange: (route: 'track' | 'harmony') => void;
}) {
  return (
    <div className="harmony-advanced-disclosure">
      <button type="button" className="harmony-disclosure-button" onClick={onToggleOpen} aria-expanded={open} title="Advanced voicing controls: octave, inversion, spread, bass, and blending" {...harmonyHelpAttrs('harmonyManualVoicingDisclosure')}>
        Advanced
      </button>
      {open && (
        <div className="harmony-advanced-grid">
          <div className="harmony-stepper">
            <span>Route</span>
            <button type="button" className={route === 'track' ? 'active' : ''} onClick={() => onRouteChange('track')}>Track</button>
            <button type="button" className={route === 'harmony' ? 'active' : ''} onClick={() => onRouteChange('harmony')}>Harmony</button>
          </div>
          <div className="harmony-stepper">
            <span>Octave</span>
            <button type="button" onClick={() => onOctaveChange(-1)} disabled={!canWriteState} title="Lower octave" {...harmonyHelpAttrs('harmonyManualOctave')}>−</button>
            <strong>{manual.selectedOctave}</strong>
            <button type="button" onClick={() => onOctaveChange(1)} disabled={!canWriteState} title="Raise octave" {...harmonyHelpAttrs('harmonyManualOctave')}>+</button>
          </div>
          <div className="harmony-stepper">
            <span>Inversion</span>
            <button type="button" onClick={() => onInversionChange(-1)} disabled={!canWriteState} title="Invert down" {...harmonyHelpAttrs('harmonyManualInversion')}>−</button>
            <strong>{manual.selectedInversion}</strong>
            <button type="button" onClick={() => onInversionChange(1)} disabled={!canWriteState} title="Invert up" {...harmonyHelpAttrs('harmonyManualInversion')}>+</button>
          </div>
          <label className="harmony-range-control" title="How spread apart the notes in the chord are" {...harmonyHelpAttrs('harmonyManualSpread')}>
            <span>Spread</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={manual.selectedSpread}
              onChange={(event) => onSpreadChange(Number(event.target.value))}
              disabled={!canWriteState}
            />
            <strong>{Math.round(manual.selectedSpread * 100)}</strong>
          </label>
          <div className="harmony-stepper bass-mode">
            <span>Bass</span>
            {BASS_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={manual.selectedBassMode === mode.value ? 'active' : ''}
                onClick={() => onBassModeChange(mode.value)}
                disabled={!canWriteState}
                title={mode.value === 'off' ? 'No bass note' : mode.value === 'root' ? 'Add root note one octave below' : 'Add fifth below'}
                {...harmonyHelpAttrs('harmonyManualBass')}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <label className="harmony-checkbox-row" title="When enabled, your manual chord blends with the active sequence instead of overriding it" {...harmonyHelpAttrs('harmonyManualBlend')}>
            <input
              type="checkbox"
              checked={blendWithSequence}
              onChange={(event) => onBlendChange(event.target.checked)}
              disabled={!canWriteState}
            />
            Blend with sequence
          </label>
        </div>
      )}
    </div>
  );
}

function ManualVoicingPopup({
  scaleLabel,
  manual,
  manualLocked,
  canWriteState,
  advancedOpen,
  chordLabel,
  previewNotes,
  semanticNotes,
  keyboardRootNote,
  scaleRootMidi,
  scaleIntervals,
  auditionSource,
  auditionEnabled,
  onAuditionSourceChange,
  onAuditionPreview,
  route,
  onRouteChange,
  rerootSemitones,
  onRerootChange,
  onAdvancedOpenChange,
  onClear,
  onStrengthChange,
  onRootChange,
  onDegreeChange,
  onQualityChange,
  onToggleExtension,
  onOctaveChange,
  onInversionChange,
  onSpreadChange,
  onBassModeChange,
  onLiveNoteDown,
  onLiveNoteUp,
  onReleaseAll,
  onCommandKeyDown,
}: {
  scaleLabel: string;
  manual: ManualHarmonyControlState;
  manualLocked: boolean;
  canWriteState: boolean;
  advancedOpen: boolean;
  chordLabel: string;
  previewNotes: readonly number[];
  semanticNotes: readonly number[];
  keyboardRootNote: number;
  scaleRootMidi: number;
  scaleIntervals: readonly number[];
  auditionSource: ProductManualSynthSource;
  auditionEnabled: boolean;
  onAuditionSourceChange: (source: ProductManualSynthSource) => void;
  onAuditionPreview: () => void;
  route: 'track' | 'harmony';
  onRouteChange: (route: 'track' | 'harmony') => void;
  rerootSemitones: number;
  onRerootChange: (semitones: number) => void;
  onAdvancedOpenChange: (open: boolean) => void;
  onClear: () => void;
  onStrengthChange: (strength: HarmonyControlStrength) => void;
  onRootChange: (rootNote: number) => void;
  onDegreeChange: (degree: number) => void;
  onQualityChange: (quality: HarmonyChordQuality) => void;
  onToggleExtension: (extension: string) => void;
  onOctaveChange: (delta: number) => void;
  onInversionChange: (delta: number) => void;
  onSpreadChange: (spread: number) => void;
  onBassModeChange: (bassMode: HarmonyBassMode) => void;
  onLiveNoteDown: (midi: number, velocity: number, source: 'onscreen' | 'qwerty' | 'midi') => void;
  onLiveNoteUp: (midi: number, source: 'onscreen' | 'qwerty' | 'midi') => void;
  onReleaseAll: () => void;
  onCommandKeyDown: (event: KeyboardEvent) => void;
}) {
  return (
    <div className="harmony-popup harmony-manual-popup" tabIndex={0} aria-label="Manual harmony voicing">
      <ManualVoicingHeader scaleLabel={scaleLabel} manualLocked={manualLocked} onClear={onClear} canWriteState={canWriteState} />
      <ManualVoicingPreview
        label={chordLabel}
        notes={previewNotes}
        auditionSource={auditionSource}
        auditionEnabled={auditionEnabled}
        onAuditionSourceChange={onAuditionSourceChange}
        onAuditionPreview={onAuditionPreview}
      />
      <div className="harmony-manual-workspace">
        <LiveChordKeyboard
          scope={{ kind: 'draft', owner: 'harmony-detail' }}
          semanticNotes={semanticNotes}
          rootNote={keyboardRootNote}
          previewRootNote={keyboardRootNote + rerootSemitones}
          scaleRootMidi={scaleRootMidi}
          scaleIntervals={scaleIntervals}
          selectedDegree={manual.selectedDegree + 1}
          rerootSemitones={rerootSemitones}
          active={canWriteState}
          onNoteDown={onLiveNoteDown}
          onNoteUp={onLiveNoteUp}
          onReleaseAll={onReleaseAll}
          onSetRoot={onRootChange}
          onSetDegree={(degree) => onDegreeChange(degree - 1)}
          onRerootChange={onRerootChange}
          onCommandKeyDown={onCommandKeyDown}
        />
        <div className="harmony-right-panel">
          <ChordModifierPanel
            manual={manual}
            chordLabel={chordLabel}
            canWriteState={canWriteState}
            onQualityChange={onQualityChange}
            onToggleExtension={onToggleExtension}
          />
          <VoicingAdvancedDisclosure
            manual={manual}
            open={advancedOpen}
            canWriteState={canWriteState}
            blendWithSequence={manual.strength === 'bias'}
            onToggleOpen={() => onAdvancedOpenChange(!advancedOpen)}
            onOctaveChange={onOctaveChange}
            onInversionChange={onInversionChange}
            onSpreadChange={onSpreadChange}
            onBassModeChange={onBassModeChange}
            onBlendChange={(blend) => onStrengthChange(blend ? 'bias' : 'force')}
            route={route}
            onRouteChange={onRouteChange}
          />
        </div>
      </div>
    </div>
  );
}

type HarmonySuggestionTriggerKey = import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestionTriggerKey;

export function HarmonyEnginePanel({ state, harmonyProjection, onStateChange, onTransientStateChange, onAuditionNote, onAuditionNotes, onLiveNoteStart, onLiveNoteStop, workspaceView = 'overview', onHarmonyLiveLayerChange, isRunning = false }: HarmonyEnginePanelProps) {
  const [voicingAdvancedOpen, setVoicingAdvancedOpen] = useState(false);
  const [auditionSource, setAuditionSource] = useState<ProductManualSynthSource>(readHarmonyAuditionSource);
  const [manualRoute, setManualRoute] = useState<'track' | 'harmony'>('track');
  const [rerootSemitones, setRerootSemitones] = useState(0);
  const [selectedStepId, setSelectedStepId] = useState(0);
  const [detailSuggestionsOpen, setDetailSuggestionsOpen] = useState(false);
  const [keyboardOwned, setKeyboardOwned] = useState(false);
  const { announceHelp } = useSliderHelp();
  const lastHelpTargetRef = useRef<string>('');
  useEffect(() => writeHarmonyAuditionSource(auditionSource), [auditionSource]);

  const announceHarmonyHelp = useCallback((target: EventTarget | null) => {
    const helpElement = findHarmonyHelpElement(target);
    if (!helpElement) return;
    const helpKey = helpElement.dataset.harmonyHelpKey;
    if (!helpKey) return;
    const helpLabel = helpElement.dataset.harmonyHelpLabel;
    const helpToken = `${helpKey}\u0000${helpLabel ?? ''}`;
    if (lastHelpTargetRef.current === helpToken) return;
    lastHelpTargetRef.current = helpToken;
    announceHelp(helpKey, helpLabel ? { page: 'global', label: helpLabel } : { page: 'global' });
  }, [announceHelp]);

  const harmonyContext = useMemo(() => ({
    bank: harmonyProjection.bank,
    rootMidi: harmonyProjection.engine.rootMidi,
    scaleId: harmonyProjection.engine.scaleId,
    scaleName: harmonyProjection.engine.scaleName,
    tension: harmonyProjection.tension,
    isEndpoint: harmonyProjection.isEndpoint,
    manualControl: harmonyProjection.manualControl,
    progression: harmonyProjection.canonicalProgression,
    resolvedHarmonyFrame: harmonyProjection.activeFrame,
  }), [harmonyProjection]);

  const manual = harmonyContext.manualControl;
  const progression = harmonyContext.progression;
  const resolvedFrame = harmonyContext.resolvedHarmonyFrame;
  const canWriteState = Boolean(onStateChange);
  const manualLocked = !resolvedFrame.manualControlAvailable || !harmonyContext.isEndpoint;
  const writeLocked = !harmonyContext.isEndpoint;
  const liveTakeoverLocked = writeLocked || Boolean(harmonyProjection?.engine.morphLocked);
  const [auditionError, setAuditionError] = useState<string | null>(null);
  const liveNoteHandlers = (failure: string) => ({
    start: onLiveNoteStart ?? (async (event: ProductLiveNoteEvent) => {
      onAuditionNote?.({
        source: event.instrument as ProductManualSynthSource,
        midi: event.note,
        velocity: event.velocity,
        durationMs: auditionDurationMs(event.instrument as ProductManualSynthSource),
      });
    }),
    stop: onLiveNoteStop ?? (() => undefined),
    onStartFailure: ({ error }: { error: Error }) => setAuditionError(`${failure}: ${error.message}`),
  });
  const detailLiveNoteInput = useLiveNoteInput(liveNoteHandlers('Could not start preview'));
  const suggestionLiveNoteInput = useLiveNoteInput(liveNoteHandlers('Could not start suggestion'));
  const suggestionLiveInputIdsRef = useRef<string[]>([]);
  const releaseSuggestionLiveNotes = useCallback(() => {
    suggestionLiveNoteInput.releaseAll();
    suggestionLiveInputIdsRef.current = [];
  }, [suggestionLiveNoteInput]);
  const harmonyReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const harmonyGestureRevisionRef = useRef(0);
  const onHarmonyLiveLayerChangeRef = useRef(onHarmonyLiveLayerChange);
  onHarmonyLiveLayerChangeRef.current = onHarmonyLiveLayerChange;
  const releaseHarmonyLayer = useCallback(() => {
    harmonyGestureRevisionRef.current += 1;
    if (harmonyReleaseTimerRef.current !== null) clearTimeout(harmonyReleaseTimerRef.current);
    harmonyReleaseTimerRef.current = null;
    onHarmonyLiveLayerChangeRef.current?.(null);
  }, []);
  const startHarmonyLayer = useCallback((layer: HarmonyLiveLayer) => {
    harmonyGestureRevisionRef.current += 1;
    const revision = harmonyGestureRevisionRef.current;
    if (harmonyReleaseTimerRef.current !== null) clearTimeout(harmonyReleaseTimerRef.current);
    onHarmonyLiveLayerChangeRef.current?.(layer);
    harmonyReleaseTimerRef.current = setTimeout(() => {
      if (harmonyGestureRevisionRef.current !== revision) return;
      harmonyReleaseTimerRef.current = null;
      onHarmonyLiveLayerChangeRef.current?.(null);
    }, 350);
  }, []);
  const startHeldHarmonyLayer = useCallback((layer: HarmonyLiveLayer) => {
    harmonyGestureRevisionRef.current += 1;
    if (harmonyReleaseTimerRef.current !== null) clearTimeout(harmonyReleaseTimerRef.current);
    harmonyReleaseTimerRef.current = null;
    onHarmonyLiveLayerChangeRef.current?.({ ...layer, latched: false });
  }, []);
  const overviewActiveLayerRef = useRef<HarmonyLiveLayer | null>(null);
  const playOverviewNotes = useCallback((notes: readonly number[], relativeOffset?: number) => {
    if (harmonyProjection?.engine.morphLocked) return;
    const pool = relativeOffset == null
      ? [...notes]
      : resolvedFrame.currentNotePool.map((note) => Math.max(0, Math.min(127, note + relativeOffset)));
    const layer: HarmonyLiveLayer = {
      kind: 'harmony-takeover',
      scope: 'overview',
      target: 'overview',
      frame: { ...resolvedFrame, currentNotePool: pool, nextNotePool: pool, activeSource: 'manualControl' },
      latched: false,
    };
    overviewActiveLayerRef.current = layer;
    startHeldHarmonyLayer(layer);
  }, [harmonyProjection?.engine.morphLocked, resolvedFrame, startHeldHarmonyLayer]);
  const latchOverview = useCallback(() => {
    if (!overviewActiveLayerRef.current || harmonyProjection?.engine.morphLocked) return;
    overviewActiveLayerRef.current = { ...overviewActiveLayerRef.current, latched: true };
    onHarmonyLiveLayerChangeRef.current?.(overviewActiveLayerRef.current);
  }, [harmonyProjection?.engine.morphLocked]);
  const stopOverview = useCallback(() => {
    overviewActiveLayerRef.current = null;
    harmonyGestureRevisionRef.current += 1;
    if (harmonyReleaseTimerRef.current !== null) clearTimeout(harmonyReleaseTimerRef.current);
    harmonyReleaseTimerRef.current = null;
    onHarmonyLiveLayerChangeRef.current?.(null, { explicitStop: true });
  }, []);
  useEffect(() => {
    if (workspaceView !== 'detail') setRerootSemitones(0);
  }, [workspaceView]);
  useEffect(() => () => releaseHarmonyLayer(), [releaseHarmonyLayer]);

  const applyPatch = useCallback((patch: Record<string, unknown>) => {
    if (!onStateChange) return;
    onStateChange((prev) => statePatch({ ...(prev as unknown as Record<string, unknown>), ...patch }));
  }, [onStateChange]);

  const updateManual = useCallback((nextManual: ManualHarmonyControlState) => {
    applyPatch({ manualHarmonyControl: sanitizeManualHarmonyControl(nextManual) });
  }, [applyPatch]);

  const updateManualTransient = useCallback((nextManual: ManualHarmonyControlState) => {
    const dispatch = onTransientStateChange ?? onStateChange;
    if (!dispatch) return;
    dispatch((previous) => statePatch({ ...(previous as unknown as Record<string, unknown>), manualHarmonyControl: sanitizeManualHarmonyControl(nextManual) }));
  }, [onStateChange, onTransientStateChange]);

  const selectedBaseIntent = useCallback((
    source: HarmonyIntent['source'],
    overrides: Partial<HarmonyIntent> = {},
  ): HarmonyIntent => {
    const reference = manual.activeIntent ?? manual.auditionIntent ?? defaultHarmonyIntent(source, manual.selectedDegree);
    const rootMode = overrides.rootMode ?? reference.rootMode ?? 'absolute';
    return sanitizeHarmonyIntent({
      ...reference,
      source,
      strength: manual.strength,
      rootMode,
      degree: manual.selectedDegree,
      rootNote: manual.selectedRootNote,
      quality: manual.selectedQuality,
      extensions: manual.selectedExtensions,
      octave: manual.selectedOctave,
      inversion: manual.selectedInversion,
      spread: manual.selectedSpread,
      bassMode: manual.selectedBassMode,
      ...overrides,
    });
  }, [manual]);

  const applyManualSelection = useCallback((
    selection: Partial<ManualHarmonyControlState>,
    intentOverrides: Partial<HarmonyIntent> = {},
  ) => {
    const nextMode = modeForIntentUpdate(selection.mode ?? manual.mode, manualLocked);
    const mergedManual = sanitizeManualHarmonyControl({ ...manual, ...selection, mode: nextMode });
    const source: HarmonyIntent['source'] = nextMode === 'control' && !manualLocked ? 'manualControl' : 'audition';
    const intent = selectedBaseIntent(source, intentOverrides);
    if (nextMode === 'control' && !manualLocked) {
      updateManual({ ...mergedManual, enabled: true, activeIntent: intent, auditionIntent: null });
      return;
    }
    const dispatchManual = nextMode === 'audition' ? updateManualTransient : updateManual;
    dispatchManual({
      ...mergedManual,
      enabled: false,
      activeIntent: nextMode === 'audition' ? mergedManual.activeIntent : null,
      auditionIntent: { ...intent, source: 'audition' },
    });
  }, [manual, manualLocked, selectedBaseIntent, updateManual, updateManualTransient]);

  const clearManualControl = useCallback(() => {
    releaseHarmonyLayer();
    updateManual({ ...manual, enabled: false, activeIntent: null, auditionIntent: null });
  }, [manual, releaseHarmonyLayer, updateManual]);

  const resolveIntentPreviewNotes = useCallback((intent: HarmonyIntent) => (
    resolveHarmonyIntentToNotePool({
      intent,
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    })
  ), [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension]);

  const playPreviewNotes = useCallback((notes: readonly number[], source: ProductManualSynthSource = auditionSource) => {
    if ((!onAuditionNote && !onAuditionNotes) || notes.length === 0) return;
    const maxNotes = auditionNoteLimit(source);
    const durationMs = auditionDurationMs(source);
    const auditionNotes = notes.slice(0, maxNotes).map((midi, index): ProductManualSynthNote => ({
        source,
        midi,
        velocity: harmonyAuditionVelocity(source, index === 0 ? 0.78 : 0.64),
        durationMs,
        ...(source === 'pad1' || source === 'pad2' ? { voiceIndex: index % 6 } : {}),
    }));
    if (onAuditionNotes) {
      setAuditionError(null);
      void onAuditionNotes(auditionNotes).catch((error: unknown) => {
        setAuditionError(`Could not play preview: ${error instanceof Error ? error.message : String(error)}`);
      });
      return;
    }
    auditionNotes.forEach((note) => onAuditionNote?.(note));
  }, [auditionSource, onAuditionNote, onAuditionNotes]);

  const previewAuditionIntent = useCallback((intent: HarmonyIntent) => {
    playPreviewNotes(resolveIntentPreviewNotes({ ...intent, source: 'audition' }));
  }, [playPreviewNotes, resolveIntentPreviewNotes]);

  const setStrength = useCallback((strength: HarmonyControlStrength) => {
    applyManualSelection({ strength }, { strength });
  }, [applyManualSelection]);

  const setRoot = useCallback((rootNote: number) => {
    const selectedRootNote = pitchClass(rootNote);
    const intentOverrides: Partial<HarmonyIntent> = { rootMode: 'absolute', rootNote: selectedRootNote };
    applyManualSelection({ selectedRootNote }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const setDegree = useCallback((degree: number) => {
    const safeDegree = clamp(Math.round(degree), 0, 6);
    const intentOverrides: Partial<HarmonyIntent> = { rootMode: 'degree', degree: safeDegree };
    applyManualSelection({ selectedDegree: safeDegree }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const setQuality = useCallback((quality: HarmonyChordQuality) => {
    const selectedQuality: HarmonyChordQuality = manual.selectedQuality === quality ? 'auto' : quality;
    const intentOverrides: Partial<HarmonyIntent> = { quality: selectedQuality };
    applyManualSelection({ selectedQuality }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedQuality, previewAuditionIntent, selectedBaseIntent]);

  const toggleExtension = useCallback((extension: string) => {
    const selectedExtensions = manual.selectedExtensions.includes(extension)
      ? manual.selectedExtensions.filter((item) => item !== extension)
      : [...manual.selectedExtensions, extension].slice(0, 8);
    const intentOverrides: Partial<HarmonyIntent> = { extensions: selectedExtensions };
    applyManualSelection({ selectedExtensions }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedExtensions, previewAuditionIntent, selectedBaseIntent]);

  const setOctave = useCallback((delta: number) => {
    const selectedOctave = clamp(manual.selectedOctave + delta, 0, 8);
    const intentOverrides: Partial<HarmonyIntent> = { octave: selectedOctave };
    applyManualSelection({ selectedOctave }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedOctave, previewAuditionIntent, selectedBaseIntent]);

  const setInversion = useCallback((delta: number) => {
    const selectedInversion = clamp(manual.selectedInversion + delta, -4, 4);
    const intentOverrides: Partial<HarmonyIntent> = { inversion: selectedInversion };
    applyManualSelection({ selectedInversion }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedInversion, previewAuditionIntent, selectedBaseIntent]);

  const setSpread = useCallback((spread: number) => {
    const selectedSpread = clamp(spread, 0, 1);
    const intentOverrides: Partial<HarmonyIntent> = { spread: selectedSpread };
    applyManualSelection({ selectedSpread }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const setBassMode = useCallback((bassMode: HarmonyBassMode) => {
    const intentOverrides: Partial<HarmonyIntent> = { bassMode };
    applyManualSelection({ selectedBassMode: bassMode }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const handleManualKeyDown = useCallback((event: KeyboardEvent) => {
    if (isTextInputTarget(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const quality = QUICK_QUALITY_KEYS[key];
    if (quality) {
      event.preventDefault();
      releaseFocusedHarmonyControl(event.target);
      setQuality(quality);
      return;
    }
    const extension = EXTENSION_KEYS.find((item) => item.key.toLowerCase() === key);
    if (extension) {
      event.preventDefault();
      releaseFocusedHarmonyControl(event.target);
      toggleExtension(extension.value);
      return;
    }
    if (key === '.') {
      event.preventDefault();
      releaseFocusedHarmonyControl(event.target);
      setOctave(-1);
    }
  }, [setOctave, setQuality, toggleExtension]);

  const manualPreviewIntent = useMemo(
    () => manual.auditionIntent ?? manual.activeIntent ?? selectedBaseIntent(manual.mode === 'control' ? 'manualControl' : 'audition'),
    [manual.activeIntent, manual.auditionIntent, manual.mode, selectedBaseIntent],
  );
  const chordLabel = intentTitle(manualPreviewIntent);
  const manualPreviewNotes = useMemo(() => resolveHarmonyIntentToNotePool({
    intent: manualPreviewIntent,
    rootMidi: harmonyContext.rootMidi,
    scaleId: harmonyContext.scaleId,
    tension: harmonyContext.tension,
  }), [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, manualPreviewIntent]);
  const activeScaleIntervals = HARMONY_SCALE_INTERVALS[Math.round(harmonyContext.scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
  const manualSemanticNotes = useMemo(() => resolveHarmonyIntentToNotePool({
    intent: manualPreviewIntent,
    rootMidi: harmonyContext.rootMidi + rerootSemitones,
    scaleId: harmonyContext.scaleId,
    tension: harmonyContext.tension,
  }), [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, manualPreviewIntent, rerootSemitones]);
  const detailKeyboardRootNote = useMemo(() => {
    const root = manualPreviewIntent.rootMode === 'degree'
      ? harmonyContext.rootMidi + (activeScaleIntervals[clamp(manualPreviewIntent.degree, 0, activeScaleIntervals.length - 1)] ?? 0)
      : manualPreviewIntent.rootNote;
    return pitchClass(root);
  }, [activeScaleIntervals, harmonyContext.rootMidi, manualPreviewIntent]);

  const playManualPreview = useCallback(() => {
    if (manualRoute === 'harmony') {
      const notes = manualPreviewNotes.slice(0, 8);
      startHarmonyLayer({
        kind: 'draft-live',
        scope: 'detail',
        target: 'detail',
        latched: false,
        frame: {
          ...resolvedFrame,
          activeSource: 'audition',
          activeStepIndex: null,
          currentNotePool: notes,
          nextNotePool: notes,
          rootMidi: notes[0] ?? resolvedFrame.rootMidi,
          effectiveRootMidiAnchor: notes[0] ?? resolvedFrame.effectiveRootMidiAnchor,
          nextSource: null,
          nextStepIndex: null,
        },
      });
      if (!isRunning) playPreviewNotes(notes);
      return;
    }
    releaseHarmonyLayer();
    playPreviewNotes(manualPreviewNotes);
  }, [isRunning, manualPreviewNotes, manualRoute, playPreviewNotes, releaseHarmonyLayer, resolvedFrame, startHarmonyLayer]);

  const suggestionController = useHarmonySuggestions({
    rootMidi: harmonyContext.rootMidi,
    scaleId: harmonyContext.scaleId,
    tension: harmonyContext.tension,
    currentDraft: {
      intent: manual.activeIntent ?? manual.auditionIntent,
      exactMidiNotes: [],
      recognizedLabel: chordLabel,
    },
    previousChord: resolvedFrame.currentNotePool,
    nextChord: resolvedFrame.nextNotePool,
    phrasePosition: progression.currentEventIndex === 0 ? 'opening' : 'middle',
    recentChords: [resolvedFrame.currentNotePool],
    nearbyNotes: [resolvedFrame.currentNotePool, resolvedFrame.nextNotePool],
    enabled: Boolean(onStateChange),
    onPreviewStart: (suggestion) => {
      const notes = suggestion.exactMidiNotes.slice(0, 8);
      if (workspaceView === 'detail') {
        releaseSuggestionLiveNotes();
        setAuditionError(null);
        suggestionLiveInputIdsRef.current = notes.map((midi, index) => {
          const inputId = `harmony-suggestion:${suggestion.id}:${index}:${midi}`;
          suggestionLiveNoteInput.noteOn(inputId, {
            source: 'ui-pad',
            instrument: auditionSource,
            note: midi,
            velocity: harmonyAuditionVelocity(auditionSource, index === 0 ? 0.78 : 0.64),
          });
          return inputId;
        });
        return;
      }
      startHeldHarmonyLayer({
        kind: 'draft-live',
        scope: workspaceView === 'simple' ? 'suggestion' : 'overview',
        target: workspaceView === 'simple' ? 'global' : 'overview',
        latched: false,
        frame: {
          ...resolvedFrame,
          activeSource: 'audition',
          activeStepIndex: null,
          currentNotePool: notes,
          nextNotePool: notes,
          rootMidi: notes[0] ?? resolvedFrame.rootMidi,
          effectiveRootMidiAnchor: notes[0] ?? resolvedFrame.effectiveRootMidiAnchor,
          nextSource: null,
          nextStepIndex: null,
        },
      });
      if (!isRunning) playPreviewNotes(notes);
    },
    onPreviewRelease: () => {
      releaseSuggestionLiveNotes();
      releaseHarmonyLayer();
    },
  });

  const suggestionBank = suggestionController.bank;
  const suggestionAxis = useMemo(() => Array.from({ length: Math.max(1, suggestionController.axis.max - suggestionController.axis.min + 1) }, (_, index) => suggestionController.axis.min + index), [suggestionController.axis.max, suggestionController.axis.min]);
  const suggestionKeyboardOwned = workspaceView === 'detail' || (workspaceView === 'simple' && keyboardOwned);

  // Z..comma hold-to-preview the suggestion bank: always in Simple, and in Detail
  // while the tray is open or `/` is held.
  useEffect(() => {
    if (!suggestionKeyboardOwned) return;
    const held = new Map<string, HarmonySuggestionTriggerKey>();
    let slashHeld = false;
    let slashUsed = false;
    const releaseAll = () => {
      for (const trigger of held.values()) suggestionController.release(trigger);
      held.clear();
      suggestionController.stop();
      slashHeld = false;
      slashUsed = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextInputTarget(event.target)) return;
      if (event.code === 'Slash') {
        if (event.repeat) return;
        event.preventDefault();
        slashHeld = true;
        slashUsed = false;
        return;
      }
      const normalizedKey = event.code || event.key.toLowerCase();
      const index = harmonyPerformanceBankIndex(event.code, event.key);
      if (index < 0 || held.has(normalizedKey) || event.repeat) return;
      if (workspaceView === 'detail' && !detailSuggestionsOpen && !slashHeld) return;
      if (slashHeld) slashUsed = true;
      event.preventDefault();
      releaseFocusedHarmonyControl(event.target);
      const trigger = harmonyPerformanceBankTrigger(index) as HarmonySuggestionTriggerKey;
      held.set(normalizedKey, trigger);
      suggestionController.press(trigger);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Slash') {
        event.preventDefault();
        if (slashHeld && !slashUsed && workspaceView === 'detail') setDetailSuggestionsOpen((open) => !open);
        slashHeld = false;
        slashUsed = false;
        return;
      }
      const key = event.code || event.key.toLowerCase();
      const trigger = held.get(key);
      if (!trigger) return;
      held.delete(key);
      suggestionController.release(trigger);
    };
    const onVisibility = () => { if (document.visibilityState !== 'visible') releaseAll(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      if (held.size > 0) releaseAll();
    };
  }, [detailSuggestionsOpen, suggestionController, suggestionKeyboardOwned, workspaceView]);

  const commitProgression = useCallback((next: HarmonyProgression, selectedIndex: number) => {
    setSelectedStepId(selectedIndex);
    const patch: Record<string, unknown> = { [progressionKey(harmonyContext.bank)]: next };
    const record = state as unknown as Record<string, unknown>;
    if (record.harmonyProgressionA === undefined && record.harmonyProgressionB === undefined && harmonyContext.bank === 'A') patch.harmonyProgression = next;
    applyPatch(patch);
  }, [applyPatch, harmonyContext.bank, state]);

  const suggestionTray = () => (
    <SuggestionGrid
      suggestions={suggestionBank.map((suggestion) => suggestion ? { ...suggestion, notes: suggestion.exactMidiNotes, exactMidiNotes: suggestion.exactMidiNotes } : null)}
      axis={suggestionAxis}
      onPress={(suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) suggestionController.press(full.triggerKey); }}
      onRelease={(suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) suggestionController.release(full.triggerKey); }}
    />
  );

  return (
    <div
      className="harmony-engine-panel"
      onMouseOver={(event) => announceHarmonyHelp(event.target)}
      onPointerDownCapture={(event) => { setKeyboardOwned(true); announceHarmonyHelp(event.target); }}
      onFocusCapture={(event) => { setKeyboardOwned(true); announceHarmonyHelp(event.target); }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardOwned(false);
      }}
    >
      {workspaceView === 'simple' && <HarmonySummaryCard
        bank={harmonyContext.bank}
        rootLabel={noteName(harmonyContext.rootMidi)}
        scaleName={harmonyContext.scaleName}
        resolvedFrame={resolvedFrame}
        manualLocked={manualLocked}
        chordSequenceEnabled={progression.enabled}
        tension={harmonyContext.tension}
        rootNote={state.rootNote ?? 4}
        scaleMode={state.scaleMode ?? 'auto'}
        manualScale={typeof state.manualScale === 'string' ? state.manualScale : 'Major (Ionian)'}
        onTensionChange={onStateChange ? (value) => applyPatch({ tension: value }) : undefined}
        onRootNoteChange={onStateChange ? (value) => applyPatch({ rootNote: value }) : undefined}
        onScaleModeChange={onStateChange ? (value) => applyPatch({ scaleMode: value }) : undefined}
        onManualScaleChange={onStateChange ? (value) => applyPatch({ manualScale: value }) : undefined}
        suggestionBank={suggestionBank}
        suggestionAxis={suggestionAxis}
        onSuggestionPress={(suggestion) => suggestionController.press(suggestion.triggerKey)}
        onSuggestionRelease={(suggestion) => suggestionController.release(suggestion.triggerKey)}
      />}
      {auditionError && <div className="harmony-suggestion-error" role="alert">{auditionError}</div>}

      {workspaceView === 'overview' && <HarmonyOverviewSurface
        progression={progression}
        keyRoot={harmonyContext.rootMidi}
        scaleId={harmonyContext.scaleId}
        selectedIndex={selectedStepId}
        readOnly={!canWriteState || liveTakeoverLocked}
        onProgressionChange={commitProgression}
        onPlayStart={playOverviewNotes}
        onPlayRelease={releaseHarmonyLayer}
        onLatch={latchOverview}
        onStop={stopOverview}
      />}

      {workspaceView === 'detail' && (
        <ManualVoicingPopup
          scaleLabel={`${noteName(harmonyContext.rootMidi)} ${harmonyContext.scaleName}`}
          manual={manual}
          manualLocked={manualLocked}
          canWriteState={canWriteState}
          advancedOpen={voicingAdvancedOpen}
          chordLabel={chordLabel}
          previewNotes={manualPreviewNotes}
          semanticNotes={manualSemanticNotes}
          keyboardRootNote={detailKeyboardRootNote}
          scaleRootMidi={harmonyContext.rootMidi}
          scaleIntervals={activeScaleIntervals}
          auditionSource={auditionSource}
          auditionEnabled={Boolean(onAuditionNote || onAuditionNotes)}
          route={manualRoute}
          onRouteChange={setManualRoute}
          rerootSemitones={rerootSemitones}
          onRerootChange={setRerootSemitones}
          onAuditionSourceChange={setAuditionSource}
          onAuditionPreview={playManualPreview}
          onAdvancedOpenChange={setVoicingAdvancedOpen}
          onClear={clearManualControl}
          onStrengthChange={setStrength}
          onRootChange={setRoot}
          onDegreeChange={setDegree}
          onQualityChange={setQuality}
          onToggleExtension={toggleExtension}
          onOctaveChange={setOctave}
          onInversionChange={setInversion}
          onSpreadChange={setSpread}
          onBassModeChange={setBassMode}
          onCommandKeyDown={handleManualKeyDown}
          onLiveNoteDown={(midi, velocity, source) => {
            if (source === 'midi') return;
            setAuditionError(null);
            detailLiveNoteInput.noteOn(`harmony-detail:${source}:${midi}`, {
              source: source === 'qwerty' ? 'computer-keyboard' : 'ui-pad',
              instrument: auditionSource,
              note: midi,
              velocity: harmonyAuditionVelocity(auditionSource, velocity),
            });
          }}
          onLiveNoteUp={(midi, source) => {
            if (source !== 'midi') detailLiveNoteInput.noteOff(`harmony-detail:${source}:${midi}`);
          }}
          onReleaseAll={() => {
            detailLiveNoteInput.releaseAll();
            releaseHarmonyLayer();
          }}
        />
      )}
      {workspaceView === 'detail' && suggestionBank.length > 0 && (
        <details className="harmony-suggestion-dock harmony-detail-suggestions" aria-label="Detail chord suggestions" open={detailSuggestionsOpen} onToggle={(event) => setDetailSuggestionsOpen(event.currentTarget.open)}>
          <summary><strong>Suggestions</strong><kbd>/</kbd><span>Hold to preview</span></summary>
          <div className="harmony-detail-suggestions-body">{suggestionTray()}</div>
        </details>
      )}
    </div>
  );
}
