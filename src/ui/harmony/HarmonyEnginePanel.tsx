import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SliderState } from '../state';
import { useSliderHelp } from '../SliderHelpOverlay';
import type { HarmonyState } from '../../audio/harmony';
import { type HarmonyLiveLayer, type HarmonyLiveLayerChangeHandler, type HarmonyProjection } from '../../audio/harmony/harmonyProjection';
import { SCALE_FAMILIES } from '../../audio/scales';
import type { ProductManualSynthNote, ProductManualSynthSource } from '../../audio/product/ProductEngineTypes';
import type { ProductLiveNoteEvent } from '../../audio/product/liveNoteEvents';
import {
  HARMONY_PROGRESSION_CAPACITY,
  defaultHarmonyIntent,
  resolveHarmonyIntentToNotePool,
  sanitizeHarmonyProgression,
  sanitizeHarmonyIntent,
  type HarmonyProgression,
  sanitizeManualHarmonyControl,
  type HarmonyBassMode,
  type HarmonyChordQuality,
  type HarmonyChordSlot,
  type HarmonyControlStrength,
  type HarmonyIntent,
  type HarmonySequenceStep,
  type ManualHarmonyControlMode,
  type ManualHarmonyControlState,
  type ResolvedHarmonyFrame,
} from '../../audio/CoreProductHarmonyControl';
import { sharedChordFromDraft } from '../../audio/harmony/harmonyChordAdapters';
import { DEFAULT_HARMONY_SCALE_INTERVALS, HARMONY_SCALE_INTERVALS } from '../../audio/harmony/harmonyScaleIntervals';
import './HarmonyEnginePanel.css';
import LiveChordKeyboard from './live/LiveChordKeyboard';
import useHarmonyChordCapture from './useHarmonyChordCapture';
import { draftFromCapturedNotes, harmonyDraftWithIntent, resolveHarmonyDraftRerootPreview, setDraftPlaybackBehavior } from './harmonyDraftChord';
import { draftFromSlot, updateDraftExactNotes } from './shared/harmonyDraftHelpers';
import RecognitionResolution from './shared/RecognitionResolution';
import useHarmonySuggestions from './useHarmonySuggestions';
import SuggestionGrid from './shared/SuggestionGrid';
import { insertHarmonySuggestion, replaceHarmonySuggestion, saveHarmonySuggestion } from './harmonySuggestionActions';
import HarmonyOverviewSurface from './HarmonyOverviewSurface';
import type { HarmonyOverviewMode } from './harmonyOverviewModel';
import { analyzeOverviewBank, applyHarmonySeqChoiceReferences, productPlayConfigsToHarmonySeqChoices, updateHarmonyOverviewSource } from './harmonyOverviewModel';
import { planHarmonyPrint, transformHarmonyChord } from '../../audio/harmony/harmonyTransform';
import type { TonalContextCandidate } from '../../audio/harmony/tonalContextAnalysis';
import { normalizeProductPlayConfigs } from '../../audio/productPlaySequencer';
import type { HarmonyReferenceState } from '../../audio/harmony/harmonyBankAnalysis';
import { useLiveNoteInput } from '../keyboard/liveNoteInput';
import { manualChordInversionLabel, recognizeClosestManualChord } from './harmonyManualChordIdentity';
import { HarmonySlotStrip } from './HarmonySlotStrip';
import { harmonyPerformanceBankIndex, harmonyPerformanceBankScope, harmonyPerformanceBankTrigger } from './harmonyPerformanceBank';
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
  selectedSlotId: number;
  onSelectedSlotChange?: (slotId: number) => void;
  canUndo?: boolean;
  onUndo?: () => void;
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
  if (source === 'slot') return 'Slot';
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

function compactIntentChordLabel(intent: HarmonyIntent): string {
  const root = intent.rootMode === 'degree'
    ? ROMAN_DEGREES[clamp(intent.degree, 0, 6)] ?? 'I'
    : noteName(intent.rootNote);
  const quality = ({
    auto: '', maj: '', min: 'm', dim: 'dim', sus: 'sus', maj7: 'maj7', min7: 'm7',
    dom7: '7', add9: 'add9', six: '6', sixNine: '6/9', nine: '9', quartal: 'quartal',
    cluster: 'cluster', custom: 'custom',
  } satisfies Record<HarmonyChordQuality, string>)[intent.quality];
  const extension = intent.extensions
    .map((item) => ({ six: '6', min7: 'm7', maj7: 'maj7', dom7: '7', add9: 'add9', nine: '9', sixNine: '6/9' }[item] ?? item))
    .find((item) => item !== quality) ?? '';
  const bass = intent.bassMode === 'captured' && intent.bassNote != null
    ? `/${noteName(intent.bassNote)}`
    : '';
  return `${root}${quality}${extension}${bass}`;
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

function bankKeys(bank: HarmonyBank): { slots: string; progression: string } {
  return bank === 'B'
    ? { slots: 'harmonyChordSlotsB', progression: 'harmonyProgressionB' }
    : { slots: 'harmonyChordSlotsA', progression: 'harmonyProgressionA' };
}

/** Convert the editor row shape into the canonical authored model. */
function canonicalProgressionFromSequence(
  sequence: readonly HarmonySequenceStep[],
  base: HarmonyProgression,
): HarmonyProgression {
  const events = sequence.slice(0, HARMONY_PROGRESSION_CAPACITY).map((step, index) => ({
    id: base.events[index]?.id ?? `harmony-event-${index}`,
    source: step.slotId !== null && step.mode === 'slot'
      ? { type: 'slot' as const, slotId: step.slotId }
      : { type: 'auto' as const },
    duration: base.events[index]?.duration ?? { unit: 'phrase' as const, value: 1 as const },
  }));
  const safeEvents = events.length > 0 ? events : base.events;
  return sanitizeHarmonyProgression({
    ...base,
    events: safeEvents,
    currentEventIndex: Math.min(base.currentEventIndex, Math.max(0, safeEvents.length - 1)),
  });
}

function shouldMirrorBaseBank(record: Record<string, unknown>, bank: HarmonyBank): boolean {
  if (bank !== 'A') return false;
  return record.harmonyChordSlotsA === undefined && record.harmonyChordSlotsB === undefined;
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
  onSuggestionSelect,
  onSuggestionPress,
  onSuggestionRelease,
  selectedSuggestion,
  onSuggestionSave,
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
  onSuggestionSelect?: (suggestion: import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion) => void;
  onSuggestionPress?: (suggestion: import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion) => void;
  onSuggestionRelease?: (suggestion: import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion) => void;
  selectedSuggestion?: import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion | null;
  onSuggestionSave?: (suggestion: import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion) => void;
}) {
  const tensionCharacter = tensionCharacterFor(tension);
  const scaleBand = tensionScaleBandLabel(tension);
  const chordBand = tensionChordBandLabel(tension);
  const controlMeta = manualLocked
    ? 'Manual control locked'
    : resolvedFrame.activeStepIndex !== null
      ? `Step ${resolvedFrame.activeStepIndex + 1} / 8`
      : resolvedFrame.activeSlotId !== null
        ? `Slot ${resolvedFrame.activeSlotId + 1}`
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
        <div className="harmony-suggestion-dock-header"><strong>Suggestions</strong><span>Hold to preview · Shift+key saves next open slot</span></div>
        <SuggestionGrid
          suggestions={suggestionBank.map((suggestion) => suggestion ? { ...suggestion, notes: suggestion.exactMidiNotes, exactMidiNotes: suggestion.exactMidiNotes } : null)}
          axis={suggestionAxis}
          onSelect={onSuggestionSelect ? (suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) onSuggestionSelect(full); } : undefined}
          onPress={onSuggestionPress ? (suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) onSuggestionPress(full); } : undefined}
          onRelease={onSuggestionRelease ? (suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) onSuggestionRelease(full); } : undefined}
          onSave={onSuggestionSave ? (suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) onSuggestionSave(full); } : undefined}
        />
        {selectedSuggestion && <div className="harmony-suggestion-action-dock" aria-label="Selected suggestion actions">
          <strong>{selectedSuggestion.label}</strong>
          <button type="button" onClick={() => selectedSuggestion && onSuggestionSave?.(selectedSuggestion)}>Save S#</button>
        </div>}
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
  onCapture,
  canWriteState,
  writeLocked,
  captureSlotId,
  slots,
}: {
  label: string;
  notes: readonly number[];
  auditionSource: ProductManualSynthSource;
  auditionEnabled: boolean;
  onAuditionSourceChange: (source: ProductManualSynthSource) => void;
  onAuditionPreview: () => void;
  onCapture?: () => void;
  canWriteState: boolean;
  writeLocked: boolean;
  captureSlotId: number;
  slots: readonly HarmonyChordSlot[];
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
        {onCapture && (
          <div className="harmony-capture-group">
            <button
              type="button"
              className="harmony-subtle-button"
              onClick={onCapture}
              disabled={!canWriteState || writeLocked || slots[captureSlotId]?.locked}
              title={`Snapshot current chord into Slot ${captureSlotId + 1}`}
              {...harmonyHelpAttrs('harmonyManualCapture')}
            >
              Capture S{captureSlotId + 1}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChordModifierPanel({
  manual,
  recognizedLabel,
  recognizedInversion,
  recognitionNoteCount,
  inputMethod,
  playbackBehavior,
  canWriteState,
  onQualityChange,
  onToggleExtension,
}: {
  manual: ManualHarmonyControlState;
  recognizedLabel: string;
  recognizedInversion: number | null;
  recognitionNoteCount: number;
  inputMethod: 'played' | 'builder';
  playbackBehavior: 'auto' | 'relative' | 'exact';
  canWriteState: boolean;
  onQualityChange: (quality: HarmonyChordQuality) => void;
  onToggleExtension: (extension: string) => void;
}) {
  return (
    <div className="harmony-modifier-panel">
      <div className="harmony-chord-type-heading">
        <div className="harmony-panel-label">Chord Type</div>
        <strong>{recognizedLabel}</strong>
        <div className="harmony-chord-type-status">
          <small>{inputMethod === 'played' ? 'Played chord' : 'Chord builder'}</small>
          <small>{playbackBehavior === 'relative' ? 'Relative' : playbackBehavior === 'exact' ? 'Exact' : 'Auto'}</small>
          <small>{recognizedInversion == null ? `${recognitionNoteCount}/3 notes` : manualChordInversionLabel(recognizedInversion)}</small>
        </div>
        <p>{inputMethod === 'played'
          ? 'Your retained keyboard gesture is the chord. Choose a root or chord type to build instead.'
          : 'Root, quality, and extensions define the chord. Playing notes switches back to your gesture.'}</p>
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
  preserveExactVoicing,
  blendWithSequence,
  onToggleOpen,
  onOctaveChange,
  onInversionChange,
  onSpreadChange,
  onBassModeChange,
  onPreserveExactVoicingChange,
  onBlendChange,
  route,
  onRouteChange,
  playbackBehavior,
  onPlaybackBehaviorChange,
}: {
  manual: ManualHarmonyControlState;
  open: boolean;
  canWriteState: boolean;
  preserveExactVoicing: boolean;
  blendWithSequence: boolean;
  onToggleOpen: () => void;
  onOctaveChange: (delta: number) => void;
  onInversionChange: (delta: number) => void;
  onSpreadChange: (spread: number) => void;
  onBassModeChange: (bassMode: HarmonyBassMode) => void;
  onPreserveExactVoicingChange: (preserve: boolean) => void;
  onBlendChange: (blend: boolean) => void;
  route: 'track' | 'harmony';
  onRouteChange: (route: 'track' | 'harmony') => void;
  playbackBehavior: 'auto' | 'relative' | 'exact';
  onPlaybackBehaviorChange: (behavior: 'auto' | 'relative' | 'exact') => void;
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
            <span>Playback</span>
            {(['auto', 'relative', 'exact'] as const).map((behavior) => (
              <button key={behavior} type="button" className={playbackBehavior === behavior ? 'active' : ''} onClick={() => onPlaybackBehaviorChange(behavior)}>
                {behavior[0]!.toUpperCase() + behavior.slice(1)}
              </button>
            ))}
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
          <label className="harmony-checkbox-row" title="Preserve the exact MIDI notes from a captured voicing" {...harmonyHelpAttrs('harmonyManualPreserve')}>
            <input
              type="checkbox"
              checked={preserveExactVoicing}
              onChange={(event) => onPreserveExactVoicingChange(event.target.checked)}
              disabled={!canWriteState}
            />
            Preserve exact voicing
          </label>
        </div>
      )}
    </div>
  );
}

function ManualVoicingPopup({
  scaleLabel,
  manual,
  slots,
  manualLocked,
  canWriteState,
  advancedOpen,
  previewLabel,
  recognizedLabel,
  recognizedInversion,
  recognitionNoteCount,
  inputMethod,
  previewNotes,
  semanticNotes,
  exactNotes,
  keyboardRootNote,
  scaleRootMidi,
  scaleIntervals,
  auditionSource,
  auditionEnabled,
  preserveExactVoicing,
  writeLocked,
  captureSlotId,
  onAuditionSourceChange,
  onAuditionPreview,
  route,
  onRouteChange,
  playbackBehavior,
  onPlaybackBehaviorChange,
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
  onPreserveExactVoicingChange,
  onCapture,
  onLiveNoteDown,
  onLiveNoteUp,
  onReleaseAll,
  onToggleExactNote,
  onMoveExactNote,
  onCommandKeyDown,
}: {
  scaleLabel: string;
  manual: ManualHarmonyControlState;
  slots: readonly HarmonyChordSlot[];
  manualLocked: boolean;
  canWriteState: boolean;
  advancedOpen: boolean;
  previewLabel: string;
  recognizedLabel: string;
  recognizedInversion: number | null;
  recognitionNoteCount: number;
  inputMethod: 'played' | 'builder';
  previewNotes: readonly number[];
  semanticNotes: readonly number[];
  exactNotes: readonly number[];
  keyboardRootNote: number;
  scaleRootMidi: number;
  scaleIntervals: readonly number[];
  auditionSource: ProductManualSynthSource;
  auditionEnabled: boolean;
  preserveExactVoicing: boolean;
  writeLocked: boolean;
  captureSlotId: number;
  onAuditionSourceChange: (source: ProductManualSynthSource) => void;
  onAuditionPreview: () => void;
  route: 'track' | 'harmony';
  onRouteChange: (route: 'track' | 'harmony') => void;
  playbackBehavior: 'auto' | 'relative' | 'exact';
  onPlaybackBehaviorChange: (behavior: 'auto' | 'relative' | 'exact') => void;
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
  onPreserveExactVoicingChange: (preserve: boolean) => void;
  onCapture: () => void;
  onLiveNoteDown: (midi: number, velocity: number, source: 'onscreen' | 'qwerty' | 'midi') => void;
  onLiveNoteUp: (midi: number, source: 'onscreen' | 'qwerty' | 'midi') => void;
  onReleaseAll: () => void;
  onToggleExactNote: (midi: number, present: boolean) => void;
  onMoveExactNote: (midi: number, octaves: number) => void;
  onCommandKeyDown: (event: KeyboardEvent) => void;
}) {
  return (
    <div className="harmony-popup harmony-manual-popup" tabIndex={0} aria-label="Manual harmony voicing">
      <ManualVoicingHeader scaleLabel={scaleLabel} manualLocked={manualLocked} onClear={onClear} canWriteState={canWriteState} />
      <ManualVoicingPreview
        label={previewLabel}
        notes={previewNotes}
        auditionSource={auditionSource}
        auditionEnabled={auditionEnabled}
        onAuditionSourceChange={onAuditionSourceChange}
        onAuditionPreview={onAuditionPreview}
        onCapture={onCapture}
        canWriteState={canWriteState}
        writeLocked={writeLocked}
        captureSlotId={captureSlotId}
        slots={slots}
      />
      <div className="harmony-manual-workspace">
        <LiveChordKeyboard
          scope={{ kind: 'draft', owner: 'harmony-detail' }}
          notes={exactNotes}
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
          onToggleExactNote={onToggleExactNote}
          onMoveExactNote={onMoveExactNote}
          onRerootChange={onRerootChange}
          onCommandKeyDown={onCommandKeyDown}
        />
        <div className="harmony-right-panel">
          <ChordModifierPanel
            manual={manual}
            recognizedLabel={recognizedLabel}
            recognizedInversion={recognizedInversion}
            recognitionNoteCount={recognitionNoteCount}
            inputMethod={inputMethod}
            playbackBehavior={playbackBehavior}
            canWriteState={canWriteState}
            onQualityChange={onQualityChange}
            onToggleExtension={onToggleExtension}
          />
          <VoicingAdvancedDisclosure
            manual={manual}
            open={advancedOpen}
            canWriteState={canWriteState}
            preserveExactVoicing={preserveExactVoicing}
            blendWithSequence={manual.strength === 'bias'}
            onToggleOpen={() => onAdvancedOpenChange(!advancedOpen)}
            onOctaveChange={onOctaveChange}
            onInversionChange={onInversionChange}
            onSpreadChange={onSpreadChange}
            onBassModeChange={onBassModeChange}
            onPreserveExactVoicingChange={onPreserveExactVoicingChange}
            onBlendChange={(blend) => onStrengthChange(blend ? 'bias' : 'force')}
            route={route}
            onRouteChange={onRouteChange}
            playbackBehavior={playbackBehavior}
            onPlaybackBehaviorChange={onPlaybackBehaviorChange}
          />
        </div>
      </div>
    </div>
  );
}

export function HarmonyEnginePanel({ state, harmonyProjection, onStateChange, onTransientStateChange, onAuditionNote, onAuditionNotes, onLiveNoteStart, onLiveNoteStop, workspaceView = 'overview', onHarmonyLiveLayerChange, isRunning = false, selectedSlotId, onSelectedSlotChange, canUndo = false, onUndo }: HarmonyEnginePanelProps) {
  const [voicingAdvancedOpen, setVoicingAdvancedOpen] = useState(false);
  const [auditionSource, setAuditionSource] = useState<ProductManualSynthSource>(readHarmonyAuditionSource);
  const [manualRoute, setManualRoute] = useState<'track' | 'harmony'>('track');
  const [rerootSemitones, setRerootSemitones] = useState(0);
  const [selectedStepId, setSelectedStepId] = useState(0);
  const [overviewMode, setOverviewMode] = useState<HarmonyOverviewMode>('arrange');
  const [selectedSuggestion, setSelectedSuggestion] = useState<import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion | null>(null);
  const [detailSuggestionsOpen, setDetailSuggestionsOpen] = useState(false);
  const [overviewSuggestionsOpen, setOverviewSuggestionsOpen] = useState(false);
  const [suggestionActionError, setSuggestionActionError] = useState<string | null>(null);
  const [keyboardOwned, setKeyboardOwned] = useState(false);
  const [detailInputMethod, setDetailInputMethod] = useState<'played' | 'builder'>('builder');
  const suggestionsOpen = workspaceView === 'overview' ? overviewSuggestionsOpen : detailSuggestionsOpen;
  const setSuggestionsOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const update = (previous: boolean) => typeof next === 'function' ? next(previous) : next;
    if (workspaceView === 'overview') setOverviewSuggestionsOpen(update);
    else setDetailSuggestionsOpen(update);
  }, [workspaceView]);
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
    morphPercent: harmonyProjection.activeFrame.morphPercent,
    isEndpoint: harmonyProjection.isEndpoint,
    manualControl: harmonyProjection.manualControl,
    chordSlots: harmonyProjection.slots,
    chordSequence: harmonyProjection.chordSequence,
    chordSequenceEnabled: harmonyProjection.chordSequenceEnabled,
    chordSequenceLength: harmonyProjection.chordSequenceLength,
    chordSequenceStepIndex: harmonyProjection.chordSequenceStepIndex,
    progression: harmonyProjection.canonicalProgression,
    resolvedHarmonyFrame: harmonyProjection.activeFrame,
  }), [harmonyProjection]);

  const record = state as unknown as Record<string, unknown>;
  const persistedPlayConfigs = useMemo(
    () => Array.isArray(record.synthPlayConfigs) ? normalizeProductPlayConfigs(record.synthPlayConfigs, 4) : null,
    [record.synthPlayConfigs],
  );
  const seqPlayChoices = useMemo<HarmonyReferenceState['seqPlayChoices']>(
    () => persistedPlayConfigs ? productPlayConfigsToHarmonySeqChoices(persistedPlayConfigs) : undefined,
    [persistedPlayConfigs],
  );
  const endpointProgressions = useMemo<HarmonyReferenceState['progressions']>(() => {
    const endpoints: NonNullable<HarmonyReferenceState['progressions']>[number][] = [];
    if (record.harmonyProgressionA !== undefined) endpoints.push({ endpoint: 'A', progression: sanitizeHarmonyProgression(record.harmonyProgressionA) });
    if (record.harmonyProgressionB !== undefined) endpoints.push({ endpoint: 'B', progression: sanitizeHarmonyProgression(record.harmonyProgressionB) });
    if (endpoints.length === 0) endpoints.push({ endpoint: harmonyProjection.bank, progression: harmonyProjection.canonicalProgression });
    return endpoints;
  }, [harmonyProjection.bank, harmonyProjection.canonicalProgression, record.harmonyProgressionA, record.harmonyProgressionB]);
  const manual = harmonyContext.manualControl;
  const slots = harmonyContext.chordSlots;
  const sequence = harmonyContext.chordSequence;
  const progression = harmonyContext.progression;
  const resolvedFrame = harmonyContext.resolvedHarmonyFrame;
  const canWriteState = Boolean(onStateChange);
  const manualLocked = !resolvedFrame.manualControlAvailable || !harmonyContext.isEndpoint;
  const writeLocked = !harmonyContext.isEndpoint;
  const liveTakeoverLocked = writeLocked || Boolean(harmonyProjection?.engine.morphLocked);
  const detailCapture = useHarmonyChordCapture({
    context: { rootMidi: harmonyContext.rootMidi, rootMidiAnchor: harmonyContext.rootMidi, scaleId: harmonyContext.scaleId },
    source: 'onscreen',
    enabled: workspaceView === 'detail' && canWriteState,
  });
  const { draft: detailDraft, capture: detailCaptureState, noteDown: captureNoteDown, noteUp: captureNoteUp, releaseAll: releaseCapturedNotes, reset: resetCapturedDraft, setDraft: setCapturedDraft } = detailCapture;
  const [auditionError, setAuditionError] = useState<string | null>(null);
  const detailLiveNoteInput = useLiveNoteInput({
    start: onLiveNoteStart ?? (async (event) => {
      onAuditionNote?.({
        source: event.instrument as ProductManualSynthSource,
        midi: event.note,
        velocity: event.velocity,
        durationMs: auditionDurationMs(event.instrument as ProductManualSynthSource),
      });
    }),
    stop: onLiveNoteStop ?? (() => undefined),
    onStartFailure: ({ error }) => setAuditionError(`Could not start preview: ${error.message}`),
  });
  const suggestionLiveNoteInput = useLiveNoteInput({
    start: onLiveNoteStart ?? (async (event) => {
      onAuditionNote?.({
        source: event.instrument as ProductManualSynthSource,
        midi: event.note,
        velocity: event.velocity,
        durationMs: auditionDurationMs(event.instrument as ProductManualSynthSource),
      });
    }),
    stop: onLiveNoteStop ?? (() => undefined),
    onStartFailure: ({ error }) => setAuditionError(`Could not start suggestion: ${error.message}`),
  });
  const slotLiveNoteInput = useLiveNoteInput({
    start: onLiveNoteStart ?? (async (event) => {
      onAuditionNote?.({
        source: event.instrument as ProductManualSynthSource,
        midi: event.note,
        velocity: event.velocity,
        durationMs: auditionDurationMs(event.instrument as ProductManualSynthSource),
      });
    }),
    stop: onLiveNoteStop ?? (() => undefined),
    onStartFailure: ({ error }) => setAuditionError(`Could not start slot preview: ${error.message}`),
  });
  const suggestionLiveInputIdsRef = useRef<string[]>([]);
  const slotLiveInputIdsRef = useRef<string[]>([]);
  const releaseSuggestionLiveNotes = useCallback(() => {
    suggestionLiveNoteInput.releaseAll();
    suggestionLiveInputIdsRef.current = [];
  }, [suggestionLiveNoteInput]);
  const releaseSlotLiveNotes = useCallback(() => {
    slotLiveNoteInput.releaseAll();
    slotLiveInputIdsRef.current = [];
  }, [slotLiveNoteInput]);
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
  const overviewSourceContext = useCallback((rootPitchClass: number, scaleId: number, scaleName: string): TonalContextCandidate => ({ rootPitchClass: pitchClass(rootPitchClass), scaleId: Math.round(scaleId), scaleName, score: 1, confidence: 1, noteCoverage: 1, diatonicChordFit: 1, rootBassEvidence: 1, cadenceEvidence: 1, orderEvidence: 1, confirmedRecognition: 1 }), []);
  const playOverviewNotes = useCallback((notes: readonly number[], slotId?: number | null, relativeOffset?: number) => {
    if (harmonyProjection?.engine.morphLocked) return;
    const exact = [...notes];
    const sourceSlot = slotId == null ? null : slots.find((slot) => slot.id === slotId) ?? null;
    const analysis = analyzeOverviewBank({ slots: slots as never, progression, sequence });
    const sourceContext = analysis.sourceContext ?? overviewSourceContext(sourceSlot?.chord?.capturedContext.rootMidi ?? harmonyContext.rootMidi, sourceSlot?.chord?.capturedContext.scaleId ?? harmonyContext.scaleId, harmonyContext.scaleName);
    const effectiveContext = overviewSourceContext(harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.scaleName);
    const transformedBase = sourceSlot?.chord ? transformHarmonyChord({ chord: sourceSlot.chord, sourceContext, effectiveContext, underlyingNotes: resolvedFrame.currentNotePool, tension: harmonyContext.tension, autoUsesSemantic: sourceSlot.chord.playbackBehavior !== 'auto' || sourceSlot.chord.intentSource === 'confirmed', customFallback: true }).exactMidiNotes : exact;
    const transformed = relativeOffset == null ? transformedBase : resolvedFrame.currentNotePool.map((note) => Math.max(0, Math.min(127, note + relativeOffset)));
    const layer: HarmonyLiveLayer = {
      kind: 'harmony-takeover',
      scope: 'overview',
      target: 'overview',
      ...(sourceSlot?.chord ? { draft: draftFromSlot(sourceSlot) } : {}),
      frame: {
        ...resolvedFrame,
        currentNotePool: transformed,
        nextNotePool: transformed,
        activeSource: sourceSlot?.chord?.playbackBehavior === 'exact' ? 'slot' : 'manualControl',
      },
      latched: false,
    };
    overviewActiveLayerRef.current = layer;
    startHeldHarmonyLayer(layer);
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.scaleName, harmonyContext.tension, harmonyProjection?.engine.morphLocked, overviewSourceContext, progression, resolvedFrame, sequence, slots, startHeldHarmonyLayer]);
  const latchOverview = useCallback(() => {
    if (!overviewActiveLayerRef.current || harmonyProjection?.engine.morphLocked) return;
    const layer = overviewActiveLayerRef.current;
    overviewActiveLayerRef.current = { ...layer, latched: true };
    onHarmonyLiveLayerChangeRef.current?.(overviewActiveLayerRef.current);
  }, [harmonyProjection?.engine.morphLocked]);
  const releaseOverview = useCallback(() => {
    releaseHarmonyLayer();
  }, [releaseHarmonyLayer]);
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

  const patchSlots = useCallback((nextSlots: HarmonyChordSlot[], extraPatch: Record<string, unknown> = {}) => {
    const keys = bankKeys(harmonyContext.bank);
    const patch: Record<string, unknown> = { ...extraPatch, [keys.slots]: nextSlots };
    if (shouldMirrorBaseBank(record, harmonyContext.bank)) patch.harmonyChordSlots = nextSlots;
    applyPatch(patch);
  }, [applyPatch, harmonyContext.bank, record]);

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
    setCapturedDraft(harmonyDraftWithIntent(detailDraft, intent));
    if (nextMode === 'control' && !manualLocked) {
      updateManual({
        ...mergedManual,
        enabled: true,
        activeIntent: intent,
        auditionIntent: null,
        slotTriggerMode: false,
        activeSlotId: null,
      });
      return;
    }
    const dispatchManual = nextMode === 'audition' ? updateManualTransient : updateManual;
    dispatchManual({
      ...mergedManual,
      enabled: false,
      activeIntent: nextMode === 'audition' ? mergedManual.activeIntent : null,
      auditionIntent: { ...intent, source: 'audition' },
      slotTriggerMode: false,
      activeSlotId: null,
    });
  }, [detailDraft, manual, manualLocked, selectedBaseIntent, setCapturedDraft, updateManual, updateManualTransient]);

  const clearManualControl = useCallback(() => {
    setDetailInputMethod('builder');
    resetCapturedDraft();
    releaseHarmonyLayer();
    updateManual({
      ...manual,
      enabled: false,
      activeIntent: null,
      auditionIntent: null,
      slotTriggerMode: false,
      activeSlotId: null,
    });
  }, [manual, releaseHarmonyLayer, resetCapturedDraft, updateManual]);

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

  const captureSelectedToSlot = useCallback((slotId: number) => {
    if (writeLocked) return;
    const currentSlot = slots[slotId];
    if (!currentSlot || currentSlot.locked) return;
    const intent = selectedBaseIntent('slot', {
      source: 'slot',
      rootMode: manual.auditionIntent?.rootMode ?? manual.activeIntent?.rootMode ?? 'absolute',
    });
    const generatedNotes = resolveHarmonyIntentToNotePool({
      intent,
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    });
    const captureNotes = detailInputMethod === 'builder' ? generatedNotes : detailDraft.exactMidiNotes;
    const captureIdentity = recognizeClosestManualChord(captureNotes, {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    });
    const capturedChord = captureNotes.length > 0
      ? sharedChordFromDraft({
        ...detailDraft,
        intent: detailInputMethod === 'builder' ? intent : detailDraft.intent,
        intentSource: detailInputMethod === 'builder' ? 'confirmed' : detailDraft.intentSource,
        exactMidiNotes: captureNotes,
        recognizedLabel: detailInputMethod === 'builder' ? compactIntentChordLabel(intent) : captureIdentity?.label ?? detailDraft.recognizedLabel,
        playbackBehavior: detailInputMethod === 'builder' ? 'relative' : detailDraft.playbackBehavior,
      })
      : sharedChordFromDraft({
        ...detailDraft,
        intent,
        intentSource: 'confirmed',
        exactMidiNotes: generatedNotes,
        capturedContext: {
          rootMidi: harmonyContext.rootMidi,
          rootMidiAnchor: harmonyContext.rootMidi,
          scaleId: harmonyContext.scaleId,
          tension: harmonyContext.tension,
        },
        recognizedLabel: intentTitle(intent),
        playbackBehavior: 'relative',
        source: 'manualVoicing',
      });
    patchSlots(slots.map((slot) => slot.id === slotId
      ? { ...slot, chord: capturedChord, name: slot.name || `Slot ${slotId + 1}` }
      : slot));
  }, [detailDraft, detailInputMethod, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, manual, patchSlots, selectedBaseIntent, slots, writeLocked]);

  const setStrength = useCallback((strength: HarmonyControlStrength) => {
    applyManualSelection({ strength }, { strength });
  }, [applyManualSelection]);

  const setRoot = useCallback((rootNote: number) => {
    setDetailInputMethod('builder');
    const selectedRootNote = pitchClass(rootNote);
    const intentOverrides: Partial<HarmonyIntent> = { rootMode: 'absolute', rootNote: selectedRootNote };
    applyManualSelection({ selectedRootNote }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const setDegree = useCallback((degree: number) => {
    setDetailInputMethod('builder');
    const safeDegree = clamp(Math.round(degree), 0, 6);
    const intentOverrides: Partial<HarmonyIntent> = { rootMode: 'degree', degree: safeDegree };
    applyManualSelection({ selectedDegree: safeDegree }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const setQuality = useCallback((quality: HarmonyChordQuality) => {
    setDetailInputMethod('builder');
    const selectedQuality: HarmonyChordQuality = manual.selectedQuality === quality ? 'auto' : quality;
    const intentOverrides: Partial<HarmonyIntent> = { quality: selectedQuality };
    applyManualSelection({ selectedQuality }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedQuality, previewAuditionIntent, selectedBaseIntent]);

  const toggleExtension = useCallback((extension: string) => {
    setDetailInputMethod('builder');
    const selectedExtensions = manual.selectedExtensions.includes(extension)
      ? manual.selectedExtensions.filter((item) => item !== extension)
      : [...manual.selectedExtensions, extension].slice(0, 8);
    const intentOverrides: Partial<HarmonyIntent> = { extensions: selectedExtensions };
    applyManualSelection({ selectedExtensions }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedExtensions, previewAuditionIntent, selectedBaseIntent]);

  const setOctave = useCallback((delta: number) => {
    setDetailInputMethod('builder');
    const selectedOctave = clamp(manual.selectedOctave + delta, 0, 8);
    const intentOverrides: Partial<HarmonyIntent> = { octave: selectedOctave };
    applyManualSelection({ selectedOctave }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedOctave, previewAuditionIntent, selectedBaseIntent]);

  const setInversion = useCallback((delta: number) => {
    setDetailInputMethod('builder');
    const selectedInversion = clamp(manual.selectedInversion + delta, -4, 4);
    const intentOverrides: Partial<HarmonyIntent> = { inversion: selectedInversion };
    applyManualSelection({ selectedInversion }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedInversion, previewAuditionIntent, selectedBaseIntent]);

  const setSpread = useCallback((spread: number) => {
    setDetailInputMethod('builder');
    const selectedSpread = clamp(spread, 0, 1);
    const intentOverrides: Partial<HarmonyIntent> = { spread: selectedSpread };
    applyManualSelection({ selectedSpread }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const setBassMode = useCallback((bassMode: HarmonyBassMode) => {
    setDetailInputMethod('builder');
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

  const activeIntentLabel = useMemo(() => {
    if (manual.slotTriggerMode && manual.activeSlotId !== null) {
      const slot = slots[manual.activeSlotId];
      return slot ? `Slot ${slot.id + 1} ${intentTitle(slot.chord?.intent)}` : 'Slot';
    }
    return intentTitle(manual.activeIntent ?? manual.auditionIntent ?? selectedBaseIntent('audition'));
  }, [manual.activeIntent, manual.activeSlotId, manual.auditionIntent, manual.slotTriggerMode, selectedBaseIntent, slots]);

  const manualPreviewIntent = useMemo(() => {
    return manual.auditionIntent ?? manual.activeIntent ?? selectedBaseIntent(manual.mode === 'control' ? 'manualControl' : 'audition');
  }, [manual.activeIntent, manual.auditionIntent, manual.mode, selectedBaseIntent]);
  const heldManualNotes = useMemo(
    () => [...detailCaptureState.heldNotes].sort((left, right) => left - right),
    [detailCaptureState.heldNotes],
  );
  const manualRecognitionNotes = heldManualNotes.length >= 3
    ? heldManualNotes
    : detailDraft.exactMidiNotes;
  const closestManualChord = useMemo(() => {
    return recognizeClosestManualChord(manualRecognitionNotes, {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    });
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, manualRecognitionNotes]);

  const manualPreviewNotes = useMemo(() => {
    if (detailInputMethod === 'played' && detailDraft.exactMidiNotes.length > 0) {
      return resolveHarmonyDraftRerootPreview(detailDraft, harmonyContext.rootMidi, rerootSemitones, harmonyContext.scaleId);
    }
    return resolveHarmonyIntentToNotePool({
      intent: manualPreviewIntent,
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    });
  }, [detailDraft, detailInputMethod, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, manualPreviewIntent, rerootSemitones]);

  const activeScaleIntervals = HARMONY_SCALE_INTERVALS[Math.round(harmonyContext.scaleId)]
    ?? DEFAULT_HARMONY_SCALE_INTERVALS;
  const manualSemanticNotes = useMemo(() => {
    const intent = detailDraft.intent ?? manualPreviewIntent;
    return resolveHarmonyIntentToNotePool({
      intent,
      rootMidi: harmonyContext.rootMidi + rerootSemitones,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    });
  }, [detailDraft.intent, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, manualPreviewIntent, rerootSemitones]);
  const builderChordIdentity = useMemo(() => recognizeClosestManualChord(manualSemanticNotes, {
    rootMidi: harmonyContext.rootMidi,
    scaleId: harmonyContext.scaleId,
    tension: harmonyContext.tension,
  }), [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, manualSemanticNotes]);
  const displayedChordIdentity = detailInputMethod === 'builder' ? builderChordIdentity : closestManualChord;
  const detailKeyboardRootNote = useMemo(() => {
    const intent = detailDraft.intent ?? manualPreviewIntent;
    const root = intent.rootMode === 'degree'
      ? harmonyContext.rootMidi + (activeScaleIntervals[clamp(intent.degree, 0, activeScaleIntervals.length - 1)] ?? 0)
      : intent.rootNote;
    return pitchClass(root);
  }, [activeScaleIntervals, detailDraft.intent, harmonyContext.rootMidi, manualPreviewIntent]);
  const updateExactNote = useCallback((midi: number, present: boolean) => {
    if (writeLocked) return;
    setDetailInputMethod('played');
    const normalizedMidi = clamp(Math.round(midi), 0, 127);
    const current = detailDraft.exactMidiNotes;
    const next = present
      ? [...current, normalizedMidi]
      : current.filter((note) => note !== normalizedMidi);
    const edited = updateDraftExactNotes(detailDraft, next, {
      rootMidi: harmonyContext.rootMidi,
      rootMidiAnchor: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    });
    setCapturedDraft({
      ...edited,
      intentSource: edited.intentSource ?? null,
      semanticCandidates: edited.semanticCandidates ?? [],
      quality: edited.quality ?? null,
      extensions: edited.extensions ?? [],
      source: edited.source ?? 'matrix',
    });
  }, [detailDraft, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, setCapturedDraft, writeLocked]);
  const moveExactNote = useCallback((midi: number, octaves: number) => {
    if (writeLocked || !detailDraft.exactMidiNotes.includes(midi)) return;
    setDetailInputMethod('played');
    const moved = clamp(midi + Math.round(octaves) * 12, 0, 127);
    const next = detailDraft.exactMidiNotes.map((note) => note === midi ? moved : note);
    const edited = updateDraftExactNotes(detailDraft, next, {
      rootMidi: harmonyContext.rootMidi,
      rootMidiAnchor: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    });
    setCapturedDraft({
      ...edited,
      intentSource: edited.intentSource ?? null,
      semanticCandidates: edited.semanticCandidates ?? [],
      quality: edited.quality ?? null,
      extensions: edited.extensions ?? [],
      source: edited.source ?? 'matrix',
    });
  }, [detailDraft, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, setCapturedDraft, writeLocked]);

  const preserveExactVoicing = Boolean((manual.activeIntent ?? manual.auditionIntent)?.preserveCapturedVoicing);

  const playManualPreview = useCallback(() => {
    if (manualRoute === 'harmony') {
      const notes = manualPreviewNotes.slice(0, 8);
      startHarmonyLayer({
        kind: 'draft-live',
        scope: 'detail',
        target: 'detail',
        latched: false,
        draft: {
          ...detailDraft,
          intent: detailDraft.intent ?? manualPreviewIntent,
          intentSource: detailDraft.intentSource ?? 'confirmed',
          exactMidiNotes: notes,
          source: 'manualVoicing',
        },
        frame: {
          ...resolvedFrame,
          activeSource: 'audition',
          activeStepIndex: null,
          activeSlotId: null,
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
  }, [detailDraft, isRunning, manualPreviewIntent, manualPreviewNotes, manualRoute, playPreviewNotes, releaseHarmonyLayer, resolvedFrame, startHarmonyLayer]);

  const suggestionController = useHarmonySuggestions({
    rootMidi: harmonyContext.rootMidi,
    scaleId: harmonyContext.scaleId,
    tension: harmonyContext.tension,
    currentDraft: {
      intent: detailDraft.intent ?? manual.activeIntent ?? manual.auditionIntent,
      exactMidiNotes: detailDraft.exactMidiNotes,
      recognizedLabel: detailDraft.recognizedLabel,
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
        scope: workspaceView === 'simple' ? 'suggestion' : workspaceView === 'overview' ? 'overview' : 'detail',
        target: workspaceView === 'simple' ? 'global' : workspaceView === 'overview' ? 'overview' : 'detail',
        latched: false,
        draft: { ...detailDraft, intent: suggestion.intent, exactMidiNotes: notes, recognizedLabel: suggestion.label, source: 'suggestion' },
        frame: {
          ...resolvedFrame,
          activeSource: 'audition',
          activeStepIndex: null,
          activeSlotId: null,
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
  const pressSuggestion = suggestionController.press;
  const releaseSuggestion = suggestionController.release;
  const stopSuggestions = suggestionController.stop;
  const suggestionKeyboardOwned = workspaceView === 'detail' || workspaceView === 'overview' || keyboardOwned;
  const suggestionAxis = useMemo(() => Array.from({ length: Math.max(1, suggestionController.axis.max - suggestionController.axis.min + 1) }, (_, index) => suggestionController.axis.min + index), [suggestionController.axis.max, suggestionController.axis.min]);
  const selectSuggestion = useCallback((suggestion: import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion) => {
    setDetailInputMethod('builder');
    setSelectedSuggestion(suggestion);
    setSuggestionActionError(null);
    setCapturedDraft(harmonyDraftWithIntent({ ...detailDraft, exactMidiNotes: [...suggestion.exactMidiNotes], recognizedLabel: suggestion.label, source: 'suggestion' }, suggestion.intent));
  }, [detailDraft, setCapturedDraft]);

  const applySuggestionActionResult = useCallback((result: ReturnType<typeof saveHarmonySuggestion>) => {
    if (!result.ok) { setSuggestionActionError(result.error ?? 'Suggestion action failed'); return; }
    const keys = bankKeys(harmonyContext.bank);
    const patch: Record<string, unknown> = {};
    if (result.state.slots !== slots) {
      patch[keys.slots] = result.state.slots;
      if (shouldMirrorBaseBank(record, harmonyContext.bank)) patch.harmonyChordSlots = result.state.slots;
    }
    if (result.state.progression && result.state.progression !== progression) {
      patch[keys.progression] = result.state.progression;
    } else if (result.state.sequence && result.state.sequence !== sequence) {
      patch[keys.progression] = canonicalProgressionFromSequence(result.state.sequence, progression);
    }
    if (Object.keys(patch).length > 0) applyPatch(patch);
    if (result.slotId !== null) onSelectedSlotChange?.(result.slotId);
    setSuggestionActionError(null);
  }, [applyPatch, harmonyContext.bank, onSelectedSlotChange, progression, record, sequence, slots]);

  const saveSelectedSuggestion = useCallback((suggestion = selectedSuggestion) => {
    if (!suggestion || writeLocked) return;
    setSelectedSuggestion(suggestion);
    applySuggestionActionResult(saveHarmonySuggestion({ slots, progression, sequence }, suggestion, { rootMidi: harmonyContext.rootMidi, rootMidiAnchor: harmonyContext.rootMidi, scaleId: harmonyContext.scaleId }));
  }, [applySuggestionActionResult, harmonyContext.rootMidi, harmonyContext.scaleId, progression, selectedSuggestion, sequence, slots, writeLocked]);
  const replaceSelectedSuggestion = useCallback(() => {
    if (!selectedSuggestion || writeLocked) return;
    applySuggestionActionResult(replaceHarmonySuggestion({ slots, progression, sequence }, selectedSuggestion, selectedStepId, { rootMidi: harmonyContext.rootMidi, rootMidiAnchor: harmonyContext.rootMidi, scaleId: harmonyContext.scaleId }));
  }, [applySuggestionActionResult, harmonyContext.rootMidi, harmonyContext.scaleId, progression, selectedStepId, selectedSuggestion, sequence, slots, writeLocked]);
  const useSuggestionInOverview = useCallback((suggestion: import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestion) => {
    if (writeLocked) return;
    setSelectedSuggestion(suggestion);
    applySuggestionActionResult(replaceHarmonySuggestion(
      { slots, progression, sequence },
      suggestion,
      selectedStepId,
      { rootMidi: harmonyContext.rootMidi, rootMidiAnchor: harmonyContext.rootMidi, scaleId: harmonyContext.scaleId },
    ));
  }, [applySuggestionActionResult, harmonyContext.rootMidi, harmonyContext.scaleId, progression, selectedStepId, sequence, slots, writeLocked]);
  const insertSelectedSuggestion = useCallback(() => {
    if (!selectedSuggestion || writeLocked) return;
    applySuggestionActionResult(insertHarmonySuggestion({ slots, progression, sequence }, selectedSuggestion, selectedStepId, { rootMidi: harmonyContext.rootMidi, rootMidiAnchor: harmonyContext.rootMidi, scaleId: harmonyContext.scaleId }));
  }, [applySuggestionActionResult, harmonyContext.rootMidi, harmonyContext.scaleId, progression, selectedStepId, selectedSuggestion, sequence, slots, writeLocked]);

  const saveCurrentChordToSlot = useCallback((slotId: number) => {
    const target = slots[slotId];
    if (!target || target.locked || writeLocked) return;
    if (workspaceView === 'detail') {
      captureSelectedToSlot(slotId);
      onSelectedSlotChange?.(slotId);
      return;
    }
    const event = progression.events[Math.max(0, Math.min(progression.events.length - 1, selectedStepId))];
    const sourceSlot = event?.source.type === 'slot' ? slots[event.source.slotId] : null;
    const sourceChord = sourceSlot?.chord;
    const exactMidiNotes = sourceChord?.exactMidiNotes?.length ? sourceChord.exactMidiNotes : resolvedFrame.currentNotePool;
    if (exactMidiNotes.length === 0) return;
    const recognition = recognizeClosestManualChord(exactMidiNotes, {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    });
    const chord: NonNullable<HarmonyChordSlot['chord']> = sourceChord
      ? {
        ...sourceChord,
        intent: sourceChord.intent ? { ...sourceChord.intent, extensions: [...sourceChord.intent.extensions], alterations: [...(sourceChord.intent.alterations ?? [])], capturedMidiNotes: [...sourceChord.intent.capturedMidiNotes] } : null,
        exactMidiNotes: [...sourceChord.exactMidiNotes],
      }
      : {
        intent: null,
        intentSource: null,
        exactMidiNotes: [...exactMidiNotes],
        recognizedLabel: recognition?.label ?? 'Custom chord',
        playbackBehavior: 'exact',
        capturedContext: { rootMidi: harmonyContext.rootMidi, rootMidiAnchor: harmonyContext.rootMidi, scaleId: harmonyContext.scaleId, tension: harmonyContext.tension },
      };
    patchSlots(slots.map((slot) => slot.id === slotId ? { ...slot, chord, name: chord.recognizedLabel || slot.name } : slot));
    onSelectedSlotChange?.(slotId);
  }, [captureSelectedToSlot, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, onSelectedSlotChange, patchSlots, progression.events, resolvedFrame.currentNotePool, selectedStepId, slots, workspaceView, writeLocked]);

  const previewSlot = useCallback((slotId: number) => {
    const slot = slots[slotId];
    if (!slot?.chord?.exactMidiNotes.length) {
      setSuggestionActionError(`S${slotId + 1} is empty`);
      return;
    }
    setSuggestionActionError(null);
    if (workspaceView === 'overview') {
      playOverviewNotes(slot.chord.exactMidiNotes, slot.id);
      return;
    }
    releaseSlotLiveNotes();
    slotLiveInputIdsRef.current = slot.chord.exactMidiNotes.slice(0, 8).map((midi, index) => {
      const inputId = `harmony-slot:${slotId}:${index}:${midi}`;
      slotLiveNoteInput.noteOn(inputId, {
        source: 'ui-pad',
        instrument: auditionSource,
        note: midi,
        velocity: harmonyAuditionVelocity(auditionSource, index === 0 ? .78 : .64),
      });
      return inputId;
    });
  }, [auditionSource, playOverviewNotes, releaseSlotLiveNotes, slotLiveNoteInput, slots, workspaceView]);

  const releaseSlotPreview = useCallback(() => {
    if (workspaceView === 'overview') releaseOverview();
    else releaseSlotLiveNotes();
  }, [releaseOverview, releaseSlotLiveNotes, workspaceView]);

  useEffect(() => {
    const held = new Map<string, 'slot' | 'suggestion'>();
    let slashHeld = false;
    let slashUsed = false;
    if (!suggestionKeyboardOwned) return;
    const releaseAll = () => {
      for (const [key, kind] of held) {
        if (kind === 'suggestion') releaseSuggestion(key as import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestionTriggerKey);
      }
      held.clear();
      stopSuggestions();
      releaseSlotPreview();
      slashHeld = false;
      slashUsed = false;
    };
    const cleanupHeld = () => {
      if (held.size === 0) return;
      releaseAll();
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
      const slotIndex = harmonyPerformanceBankIndex(event.code, event.key);
      if (slotIndex < 0 || held.has(normalizedKey) || event.repeat) return;
      const suggestionMode = workspaceView === 'simple' || harmonyPerformanceBankScope(suggestionsOpen, slashHeld) === 'suggestions';
      if (slashHeld) slashUsed = true;
      event.preventDefault();
      releaseFocusedHarmonyControl(event.target);
      if (suggestionMode) {
        const trigger = harmonyPerformanceBankTrigger(slotIndex)!;
        const suggestion = suggestionBank[slotIndex] ?? null;
        if (!suggestion) {
          setSuggestionActionError(`Suggestion ${slotIndex + 1} is empty`);
          return;
        }
        held.set(normalizedKey, 'suggestion');
        if (event.shiftKey) {
          setSelectedSuggestion(suggestion);
          saveSelectedSuggestion(suggestion);
          return;
        }
        pressSuggestion(trigger as import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestionTriggerKey);
        return;
      }
      held.set(normalizedKey, 'slot');
      if (event.shiftKey) {
        saveCurrentChordToSlot(slotIndex);
        return;
      }
      previewSlot(slotIndex);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Slash') {
        event.preventDefault();
        if (slashHeld && !slashUsed) setSuggestionsOpen((open) => !open);
        slashHeld = false;
        slashUsed = false;
        return;
      }
      const key = event.code || event.key.toLowerCase();
      const kind = held.get(key);
      if (!kind) return;
      held.delete(key);
      if (kind === 'suggestion') {
        const index = harmonyPerformanceBankIndex(event.code, event.key);
        const trigger = harmonyPerformanceBankTrigger(index);
        if (trigger) releaseSuggestion(trigger as import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestionTriggerKey);
      }
      else releaseSlotPreview();
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
      cleanupHeld();
    };
  }, [pressSuggestion, previewSlot, releaseSlotPreview, releaseSuggestion, saveCurrentChordToSlot, saveSelectedSuggestion, slots, suggestionBank, suggestionKeyboardOwned, suggestionsOpen, stopSuggestions, workspaceView]);

  const selectedSlotChord = slots[selectedSlotId]?.chord ?? null;
  const selectedSlotDraftKey = selectedSlotChord
    ? [
      selectedSlotId,
      selectedSlotChord.recognizedLabel,
      selectedSlotChord.playbackBehavior,
      selectedSlotChord.exactMidiNotes.join(','),
      selectedSlotChord.intent?.rootMode,
      selectedSlotChord.intent?.rootNote,
      selectedSlotChord.intent?.degree,
      selectedSlotChord.intent?.quality,
      selectedSlotChord.intent?.extensions.join(','),
      selectedSlotChord.intent?.inversion,
      selectedSlotChord.intent?.octave,
    ].join('|')
    : `${selectedSlotId}|empty`;
  useEffect(() => {
    if (!selectedSlotChord?.exactMidiNotes.length) return;
    setDetailInputMethod('played');
    setCapturedDraft(draftFromCapturedNotes(
      selectedSlotChord.exactMidiNotes,
      {
        rootMidi: harmonyContext.rootMidi,
        rootMidiAnchor: selectedSlotChord.capturedContext.rootMidiAnchor ?? harmonyContext.rootMidi,
        scaleId: selectedSlotChord.capturedContext.scaleId,
      },
      'slot',
      selectedSlotChord.intent,
    ));
  }, [harmonyContext.rootMidi, selectedSlotDraftKey, setCapturedDraft]);


  const setPreserveExactVoicing = useCallback((preserve: boolean) => {
    setDetailInputMethod('builder');
    applyManualSelection({}, { preserveCapturedVoicing: preserve });
  }, [applyManualSelection]);

  const commitOverviewState = useCallback((next: {
    progression: HarmonyProgression;
    slots: HarmonyChordSlot[];
    sequence?: readonly HarmonySequenceStep[] | null;
    progressions?: HarmonyReferenceState['progressions'];
    seqPlayChoices?: HarmonyReferenceState['seqPlayChoices'];
  }, selectedIndex: number) => {
    setSelectedStepId(selectedIndex);
    const keys = bankKeys(harmonyContext.bank);
    const patch: Record<string, unknown> = { [keys.progression]: next.progression, [keys.slots]: next.slots };
    for (const endpoint of next.progressions ?? []) {
      if (!endpoint.progression) continue;
      patch[endpoint.endpoint === 'A' ? 'harmonyProgressionA' : 'harmonyProgressionB'] = endpoint.progression;
    }
    if (persistedPlayConfigs && next.seqPlayChoices) {
      patch.synthPlayConfigs = applyHarmonySeqChoiceReferences(persistedPlayConfigs, next.seqPlayChoices);
    }
    if (record.harmonyProgressionA === undefined && record.harmonyProgressionB === undefined && harmonyContext.bank === 'A') patch.harmonyProgression = next.progression;
    if (shouldMirrorBaseBank(record, harmonyContext.bank)) patch.harmonyChordSlots = next.slots;
    applyPatch(patch);
  }, [applyPatch, harmonyContext.bank, persistedPlayConfigs, record]);
  const assignSlotToSelectedEvent = useCallback((slotId: number) => {
    if (writeLocked || !slots[slotId]?.chord) return;
    commitOverviewState({
      progression: updateHarmonyOverviewSource(progression, selectedStepId, slotId),
      slots: slots.slice() as HarmonyChordSlot[],
      sequence,
      progressions: endpointProgressions,
      seqPlayChoices,
    }, selectedStepId);
  }, [commitOverviewState, endpointProgressions, progression, selectedStepId, seqPlayChoices, sequence, slots, writeLocked]);
  const printOverview = useCallback(() => {
    const analysis = analyzeOverviewBank({ slots: slots as never, progression, sequence });
    const sourceContext = analysis.sourceContext ?? overviewSourceContext(harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.scaleName);
    const effectiveContext = overviewSourceContext(harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.scaleName);
    const patch = planHarmonyPrint(slots, sourceContext, effectiveContext, { tension: harmonyContext.tension, autoUsesSemantic: (chord) => chord.playbackBehavior === 'auto' && chord.intentSource === 'confirmed' });
    if (patch.after.some((slot, index) => {
      const beforeNotes = slots[index]?.chord?.exactMidiNotes ?? [];
      const afterNotes = slot.chord?.exactMidiNotes ?? [];
      return beforeNotes.length !== afterNotes.length || afterNotes.some((note, noteIndex) => note !== beforeNotes[noteIndex]);
    })) patchSlots(patch.apply() as HarmonyChordSlot[]);
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.scaleName, harmonyContext.tension, overviewSourceContext, patchSlots, progression, sequence, slots]);

  const overviewSurface = <HarmonyOverviewSurface
    progression={progression}
    slots={slots}
    sequence={sequence}
    progressions={endpointProgressions}
    seqPlayChoices={seqPlayChoices}
    keyboardRoot={harmonyContext.rootMidi}
    mode={overviewMode}
    selectedIndex={selectedStepId}
    readOnly={!canWriteState || liveTakeoverLocked}
    onModeChange={setOverviewMode}
    onOverviewStateChange={commitOverviewState}
    onPlayStart={playOverviewNotes}
    onPlayRelease={releaseOverview}
    onLatch={latchOverview}
    onStop={stopOverview}
    onPrint={printOverview}
    canUndo={canUndo}
    onUndo={onUndo}
    selectedSuggestionLabel={selectedSuggestion?.label ?? null}
    onSuggestionReplace={replaceSelectedSuggestion}
    onSuggestionInsert={insertSelectedSuggestion}
    onSuggestionSave={() => saveSelectedSuggestion()}
    suggestionsOpen={suggestionsOpen}
    onSuggestionsOpenChange={setSuggestionsOpen}
    suggestions={<SuggestionGrid suggestions={suggestionBank.map((suggestion) => suggestion ? { ...suggestion, notes: suggestion.exactMidiNotes, audioSuggestion: suggestion } : null)} axis={suggestionAxis} onSelect={(suggestion) => { if (suggestion.audioSuggestion) useSuggestionInOverview(suggestion.audioSuggestion); }} onPress={(suggestion) => { if (suggestion.audioSuggestion) setSelectedSuggestion(suggestion.audioSuggestion); if (suggestion.triggerKey) pressSuggestion(suggestion.triggerKey as import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestionTriggerKey); }} onRelease={(suggestion) => { if (suggestion.triggerKey) releaseSuggestion(suggestion.triggerKey as import('../../audio/harmony/chordSuggestionEngine').HarmonySuggestionTriggerKey); }} onSave={(suggestion) => { if (suggestion.audioSuggestion) saveSelectedSuggestion(suggestion.audioSuggestion); }} />}
  />;

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
      <HarmonySlotStrip
        slots={slots}
        activeSlotId={resolvedFrame.activeSlotId}
        selectedSlotId={selectedSlotId}
        context={workspaceView === 'overview' ? 'overview' : 'detail'}
        disabled={writeLocked}
        onSelect={onSelectedSlotChange}
        onPreviewStart={previewSlot}
        onPreviewEnd={releaseSlotPreview}
        onSaveCurrent={saveCurrentChordToSlot}
        onAssign={assignSlotToSelectedEvent}
      />
      {workspaceView === 'simple' && <HarmonySummaryCard
        bank={harmonyContext.bank}
        rootLabel={noteName(harmonyContext.rootMidi)}
        scaleName={harmonyContext.scaleName}
        resolvedFrame={resolvedFrame}
        showPolicyControls={workspaceView === 'simple'}
        manualLocked={manualLocked}
        chordSequenceEnabled={harmonyContext.chordSequenceEnabled}
        tension={harmonyContext.tension}
        rootNote={state.rootNote ?? 4}
        scaleMode={state.scaleMode ?? 'auto'}
        manualScale={typeof state.manualScale === 'string' ? state.manualScale : 'Major (Ionian)'}
        onTensionChange={onStateChange ? (value) => applyPatch({ tension: value }) : undefined}
        onRootNoteChange={onStateChange ? (value) => applyPatch({ rootNote: value }) : undefined}
        onScaleModeChange={onStateChange ? (value) => applyPatch({ scaleMode: value }) : undefined}
        onManualScaleChange={onStateChange ? (value) => applyPatch({ manualScale: value }) : undefined}
        suggestionBank={workspaceView === 'simple' ? suggestionBank : undefined}
        suggestionAxis={workspaceView === 'simple' ? suggestionAxis : undefined}
        onSuggestionSelect={workspaceView === 'simple' ? selectSuggestion : undefined}
        onSuggestionPress={workspaceView === 'simple' ? (suggestion) => suggestionController.press(suggestion.triggerKey) : undefined}
        onSuggestionRelease={workspaceView === 'simple' ? (suggestion) => suggestionController.release(suggestion.triggerKey) : undefined}
        selectedSuggestion={workspaceView === 'simple' ? selectedSuggestion : null}
        onSuggestionSave={workspaceView === 'simple' ? saveSelectedSuggestion : undefined}
      />}
      {suggestionActionError && <div className="harmony-suggestion-error" role="alert">{suggestionActionError}</div>}
      {auditionError && <div className="harmony-suggestion-error" role="alert">{auditionError}</div>}

      {workspaceView === 'overview' && overviewSurface}

      {workspaceView === 'detail' && (
        <>
        <ManualVoicingPopup
          scaleLabel={`${noteName(harmonyContext.rootMidi)} ${harmonyContext.scaleName}`}
          manual={manual}
          slots={slots}
          manualLocked={manualLocked}
          canWriteState={canWriteState}
          advancedOpen={voicingAdvancedOpen}
          previewLabel={displayedChordIdentity?.label ?? activeIntentLabel}
          recognizedLabel={displayedChordIdentity?.label ?? activeIntentLabel}
          recognizedInversion={displayedChordIdentity?.voicing.inversion ?? null}
          recognitionNoteCount={detailInputMethod === 'builder' ? manualSemanticNotes.length : manualRecognitionNotes.length}
          inputMethod={detailInputMethod}
          previewNotes={manualPreviewNotes}
          semanticNotes={manualSemanticNotes}
          exactNotes={detailDraft.exactMidiNotes}
          keyboardRootNote={detailKeyboardRootNote}
          scaleRootMidi={harmonyContext.rootMidi}
          scaleIntervals={activeScaleIntervals}
          auditionSource={auditionSource}
          auditionEnabled={Boolean(onAuditionNote || onAuditionNotes)}
          route={manualRoute}
          onRouteChange={setManualRoute}
          playbackBehavior={detailDraft.playbackBehavior}
          onPlaybackBehaviorChange={(behavior) => setCapturedDraft(setDraftPlaybackBehavior(detailDraft, behavior))}
          rerootSemitones={rerootSemitones}
          onRerootChange={setRerootSemitones}
          preserveExactVoicing={preserveExactVoicing}
          writeLocked={writeLocked}
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
          onPreserveExactVoicingChange={setPreserveExactVoicing}
          onCapture={() => captureSelectedToSlot(selectedSlotId)}
          captureSlotId={selectedSlotId}
          onCommandKeyDown={handleManualKeyDown}
          onLiveNoteDown={(midi, velocity, source) => {
            setDetailInputMethod('played');
            captureNoteDown(midi, undefined, velocity);
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
            captureNoteUp(midi);
            if (source !== 'midi') detailLiveNoteInput.noteOff(`harmony-detail:${source}:${midi}`);
          }}
          onReleaseAll={() => {
            releaseCapturedNotes();
            detailLiveNoteInput.releaseAll();
            releaseHarmonyLayer();
          }}
          onToggleExactNote={updateExactNote}
          onMoveExactNote={moveExactNote}
        />
        <RecognitionResolution draft={detailDraft} disabled={writeLocked} onChange={setCapturedDraft} />
        </>
      )}
      {workspaceView === 'detail' && suggestionBank.length > 0 && (
        <details className="harmony-suggestion-dock harmony-detail-suggestions" aria-label="Detail chord suggestions" open={suggestionsOpen} onToggle={(event) => setSuggestionsOpen(event.currentTarget.open)}>
          <summary><strong>Suggestions</strong><kbd>/</kbd><span>{selectedSuggestion?.label ?? 'Explore when needed'}</span></summary>
          <div className="harmony-detail-suggestions-body">
            <SuggestionGrid
              suggestions={suggestionBank.map((suggestion) => suggestion ? { ...suggestion, notes: suggestion.exactMidiNotes, exactMidiNotes: suggestion.exactMidiNotes } : null)}
              axis={suggestionAxis}
              onSelect={(suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) selectSuggestion(full); }}
              onPress={(suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) suggestionController.press(full.triggerKey); }}
              onRelease={(suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) suggestionController.release(full.triggerKey); }}
              onSave={(suggestion) => { const full = suggestionBank.find((item) => item?.id === suggestion.id); if (full) saveSelectedSuggestion(full); }}
            />
            {selectedSuggestion && <div className="harmony-suggestion-action-dock"><strong>{selectedSuggestion.label}</strong><button type="button" onClick={() => saveSelectedSuggestion(selectedSuggestion)}>Save suggestion</button></div>}
          </div>
        </details>
      )}
    </div>
  );
}
