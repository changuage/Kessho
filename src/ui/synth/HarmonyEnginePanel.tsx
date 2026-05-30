import React, { useCallback, useMemo, useState } from 'react';
import type { SliderState } from '../state';
import type { HarmonyState } from '../../audio/harmony';
import {
  HARMONY_NOTE_KEYS,
  HARMONY_SLOT_TRIGGER_KEYS,
  commitBaselineMap,
  defaultHarmonyIntent,
  generateHarmonySequence,
  generateHarmonySlots,
  generateHarmonySlotsAndSequence,
  resolveProductHarmonyState,
  sanitizeHarmonyIntent,
  sanitizeManualHarmonyControl,
  type HarmonyBassMode,
  type HarmonyChordQuality,
  type HarmonyChordSlot,
  type HarmonyControlStrength,
  type HarmonyIntent,
  type HarmonySequenceStep,
  type HarmonySequenceStepMode,
  type ManualHarmonyControlMode,
  type ManualHarmonyControlState,
  type ResolvedHarmonyFrame,
} from '../../audio/CoreProductHarmonyControl';

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

const SEQUENCE_MODES: readonly { value: HarmonySequenceStepMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'intent', label: 'Intent' },
  { value: 'slotCopy', label: 'Copy' },
  { value: 'slotFollow', label: 'Follow' },
];

const BASS_MODES: readonly { value: HarmonyBassMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'root', label: 'Root' },
  { value: 'fifth', label: 'Fifth' },
];

const PRODUCT_SCALE_IDS = new Map<string, number>([
  ['Major (Ionian)', 1],
  ['Aeolian', 2],
  ['Major Pentatonic', 3],
  ['Octatonic Half-Whole', 4],
  ['Lydian', 5],
  ['Mixolydian', 6],
  ['Minor Pentatonic', 7],
  ['Dorian', 8],
  ['Harmonic Minor', 9],
  ['Melodic Minor', 10],
  ['Phrygian Dominant', 11],
]);

type HarmonyBank = 'A' | 'B';

export interface HarmonyEnginePanelProps {
  state: SliderState;
  harmonyState?: HarmonyState | null;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
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

function scaleIdFromName(name: string | undefined): number {
  if (!name) return 1;
  const exact = PRODUCT_SCALE_IDS.get(name);
  if (exact) return exact;
  const normalized = name.toLowerCase();
  if (normalized.includes('major pentatonic')) return 3;
  if (normalized.includes('minor pentatonic')) return 7;
  if (normalized.includes('harmonic minor')) return 9;
  if (normalized.includes('melodic minor')) return 10;
  if (normalized.includes('phrygian')) return 11;
  if (normalized.includes('octatonic') || normalized.includes('hirajoshi')) return 4;
  if (normalized.includes('mixolydian')) return 6;
  if (normalized.includes('lydian')) return 5;
  if (normalized.includes('dorian')) return 8;
  if (normalized.includes('minor') || normalized.includes('aeolian')) return 2;
  return 1;
}

function rootMidiFromState(state: SliderState): number {
  const record = state as unknown as Record<string, unknown>;
  const explicit = record.rootMidi;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return clamp(explicit, 0, 127);
  return 60 + pitchClass(state.rootNote);
}

function morphPercentFromState(state: SliderState): number {
  const record = state as unknown as Record<string, unknown>;
  const explicit = record.harmonyMorphPercent;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return clamp(explicit, 0, 100);
  const journeyPhase = record.journeyMorphPhase;
  if (typeof journeyPhase === 'number' && Number.isFinite(journeyPhase)) return clamp(journeyPhase * 100, 0, 100);
  return 0;
}

function seedFromState(state: SliderState, salt: number): number {
  if (Number.isFinite(state.harmonyGenerationSeed) && state.harmonyGenerationSeed > 0) {
    return Math.round(state.harmonyGenerationSeed) ^ salt;
  }
  const root = pitchClass(state.rootNote);
  const tension = Math.round(clamp(state.tension, 0, 1) * 1000);
  const randomness = Math.round(clamp(state.randomness, 0, 1) * 1000);
  return ((root + 1) * 131 + (tension + 17) * 313 + (randomness + 29) * 911 + salt * 3571) >>> 0;
}

function nextGenerationSeed(state: SliderState): number {
  const current = Number.isFinite(state.harmonyGenerationSeed) ? Math.max(0, Math.round(state.harmonyGenerationSeed)) : 0;
  return (current + 1) & 0x7fffffff;
}

function formatPool(notes: readonly number[]): string {
  if (notes.length === 0) return 'None';
  return notes.slice(0, 8).map(midiNoteName).join(' ');
}

function sourceLabel(source: ResolvedHarmonyFrame['activeSource'] | null): string {
  if (!source) return 'None';
  if (source === 'manualControl') return 'Manual';
  if (source === 'presetMorph') return 'Morph';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function intentTitle(intent: HarmonyIntent | null | undefined): string {
  if (!intent) return 'Empty';
  const root = intent.rootMode === 'degree'
    ? ROMAN_DEGREES[clamp(intent.degree, 0, 6)] ?? 'I'
    : noteName(intent.rootNote);
  const quality = intent.quality === 'auto' ? 'Auto' : intent.quality;
  return `${root} ${quality}`;
}

function sequenceStepTitle(step: HarmonySequenceStep, slots: readonly HarmonyChordSlot[]): string {
  if (step.mode === 'slotCopy' || step.mode === 'slotFollow') {
    const slot = step.slotId !== null ? slots[step.slotId] : null;
    return slot ? `S${slot.id + 1} ${intentTitle(slot.intent)}` : 'Slot';
  }
  if (step.mode === 'intent' && step.intent) return intentTitle(step.intent);
  return `${ROMAN_DEGREES[clamp(step.degree, 0, 6)] ?? 'I'} ${step.quality === 'auto' ? 'Auto' : step.quality}`;
}

function statePatch(patch: Record<string, unknown>): SliderState {
  return patch as unknown as SliderState;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function bankKeys(bank: HarmonyBank): { slots: string; sequence: string } {
  return bank === 'B'
    ? { slots: 'harmonyChordSlotsB', sequence: 'harmonyChordSequenceB' }
    : { slots: 'harmonyChordSlotsA', sequence: 'harmonyChordSequenceA' };
}

function shouldMirrorBaseBank(record: Record<string, unknown>, bank: HarmonyBank): boolean {
  if (bank !== 'A') return false;
  return record.harmonyChordSlotsA === undefined && record.harmonyChordSlotsB === undefined;
}

function modeForIntentUpdate(mode: ManualHarmonyControlMode, manualLocked: boolean): ManualHarmonyControlMode {
  if (manualLocked && mode !== 'audition') return 'audition';
  return mode;
}

export function HarmonyEnginePanel({ state, harmonyState, onStateChange }: HarmonyEnginePanelProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);

  const harmonyContext = useMemo(() => {
    const rootMidi = rootMidiFromState(state);
    const scaleName = harmonyState?.scaleFamily.name ?? state.manualScale;
    const scaleId = scaleIdFromName(scaleName);
    const tension = clamp(state.tension, 0, 1);
    const morphPercent = morphPercentFromState(state);
    const resolved = resolveProductHarmonyState({
      state: state as unknown as Record<string, unknown>,
      rootMidi,
      scaleId,
      tension,
      seed: seedFromState(state, 0),
      morphPercent,
    });
    const bank: HarmonyBank = morphPercent >= 50 ? 'B' : 'A';
    return {
      bank,
      rootMidi,
      scaleId,
      scaleName,
      tension,
      morphPercent,
      isEndpoint: morphPercent <= 0 || morphPercent >= 100,
      ...resolved,
    };
  }, [harmonyState, state]);

  const record = state as unknown as Record<string, unknown>;
  const manual = harmonyContext.manualControl;
  const slots = harmonyContext.chordSlots;
  const sequence = harmonyContext.chordSequence;
  const resolvedFrame = harmonyContext.resolvedHarmonyFrame;
  const canWriteState = Boolean(onStateChange);
  const manualLocked = !resolvedFrame.manualControlAvailable || !harmonyContext.isEndpoint;
  const writeLocked = !harmonyContext.isEndpoint;

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

  const patchSequence = useCallback((nextSequence: HarmonySequenceStep[], extraPatch: Record<string, unknown> = {}) => {
    const keys = bankKeys(harmonyContext.bank);
    const patch: Record<string, unknown> = { ...extraPatch, [keys.sequence]: nextSequence };
    if (record.harmonyChordSequenceA === undefined && record.harmonyChordSequenceB === undefined && harmonyContext.bank === 'A') {
      patch.harmonyChordSequence = nextSequence;
    }
    applyPatch(patch);
  }, [applyPatch, harmonyContext.bank, record]);

  const updateManual = useCallback((nextManual: ManualHarmonyControlState) => {
    applyPatch({ manualHarmonyControl: sanitizeManualHarmonyControl(nextManual) });
  }, [applyPatch]);

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
    updateManual({
      ...mergedManual,
      enabled: false,
      activeIntent: nextMode === 'audition' ? mergedManual.activeIntent : null,
      auditionIntent: { ...intent, source: 'audition' },
      slotTriggerMode: false,
      activeSlotId: null,
    });
  }, [manual, manualLocked, selectedBaseIntent, updateManual]);

  const setManualMode = useCallback((mode: ManualHarmonyControlMode) => {
    if (mode !== 'audition' && manualLocked) return;
    applyManualSelection({ mode }, {});
  }, [applyManualSelection, manualLocked]);

  const clearManualControl = useCallback(() => {
    updateManual({
      ...manual,
      enabled: false,
      activeIntent: null,
      auditionIntent: null,
      slotTriggerMode: false,
      activeSlotId: null,
    });
  }, [manual, updateManual]);

  const captureSelectedToSlot = useCallback((slotId: number) => {
    if (writeLocked) return;
    const currentSlot = slots[slotId];
    if (!currentSlot || currentSlot.locked) return;
    const intent = selectedBaseIntent('slot', {
      source: 'slot',
      rootMode: manual.auditionIntent?.rootMode ?? manual.activeIntent?.rootMode ?? 'absolute',
    });
    patchSlots(slots.map((slot) => slot.id === slotId
      ? { ...slot, intent, name: slot.name || `Slot ${slotId + 1}` }
      : slot));
  }, [manual, patchSlots, selectedBaseIntent, slots, writeLocked]);

  const activateSlot = useCallback((slotId: number) => {
    const slot = slots[slotId];
    if (!slot) return;
    if (manual.mode === 'capture') {
      captureSelectedToSlot(slotId);
      return;
    }
    if (manual.mode === 'control' && !manualLocked) {
      updateManual({
        ...manual,
        enabled: false,
        activeIntent: null,
        auditionIntent: null,
        slotTriggerMode: true,
        activeSlotId: slotId,
      });
      return;
    }
    updateManual({
      ...manual,
      mode: 'audition',
      enabled: false,
      auditionIntent: { ...slot.intent, source: 'audition' },
      slotTriggerMode: false,
      activeSlotId: null,
    });
  }, [captureSelectedToSlot, manual, manualLocked, slots, updateManual]);

  const updateSlot = useCallback((slotId: number, patch: Partial<HarmonyChordSlot>) => {
    if (writeLocked) return;
    patchSlots(slots.map((slot) => slot.id === slotId ? { ...slot, ...patch } : slot));
  }, [patchSlots, slots, writeLocked]);

  const updateStep = useCallback((stepId: number, patch: Partial<HarmonySequenceStep>) => {
    if (writeLocked) return;
    patchSequence(sequence.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  }, [patchSequence, sequence, writeLocked]);

  const setSequenceEnabled = useCallback((enabled: boolean) => {
    applyPatch({ harmonyChordSequenceEnabled: enabled });
  }, [applyPatch]);

  const generateSlotsAction = useCallback(() => {
    if (writeLocked) return;
    const generationSeed = nextGenerationSeed(state);
    const nextSlots = generateHarmonySlots(seedFromState({ ...state, harmonyGenerationSeed: generationSeed }, 0), {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    }, slots);
    patchSlots(nextSlots, { harmonyGenerationSeed: generationSeed });
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, patchSlots, slots, state, writeLocked]);

  const generateSequenceAction = useCallback(() => {
    if (writeLocked) return;
    const generationSeed = nextGenerationSeed(state);
    const nextSequence = generateHarmonySequence(seedFromState({ ...state, harmonyGenerationSeed: generationSeed }, 0), {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    }, sequence, slots);
    patchSequence(nextSequence, { harmonyGenerationSeed: generationSeed });
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, patchSequence, sequence, slots, state, writeLocked]);

  const generateBothAction = useCallback(() => {
    if (writeLocked) return;
    const generationSeed = nextGenerationSeed(state);
    const generated = generateHarmonySlotsAndSequence(seedFromState({ ...state, harmonyGenerationSeed: generationSeed }, 0), {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    }, slots, sequence);
    const keys = bankKeys(harmonyContext.bank);
    const patch: Record<string, unknown> = {
      [keys.slots]: generated.slots,
      [keys.sequence]: generated.sequence,
      harmonyChordSequenceEnabled: true,
      harmonyGenerationSeed: generationSeed,
    };
    if (shouldMirrorBaseBank(record, harmonyContext.bank)) patch.harmonyChordSlots = generated.slots;
    if (record.harmonyChordSequenceA === undefined && record.harmonyChordSequenceB === undefined && harmonyContext.bank === 'A') {
      patch.harmonyChordSequence = generated.sequence;
    }
    applyPatch(patch);
  }, [applyPatch, harmonyContext.bank, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, record, sequence, slots, state, writeLocked]);

  const commitBaselineAction = useCallback(() => {
    if (writeLocked) return;
    patchSequence(commitBaselineMap({
      seed: seedFromState(state, 0),
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
      existingSequence: sequence,
    }));
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, patchSequence, sequence, state, writeLocked]);

  const setStrength = useCallback((strength: HarmonyControlStrength) => {
    applyManualSelection({ strength }, { strength });
  }, [applyManualSelection]);

  const setRoot = useCallback((rootNote: number) => {
    applyManualSelection({ selectedRootNote: pitchClass(rootNote) }, { rootMode: 'absolute', rootNote: pitchClass(rootNote) });
  }, [applyManualSelection]);

  const setDegree = useCallback((degree: number) => {
    const safeDegree = clamp(Math.round(degree), 0, 6);
    applyManualSelection({ selectedDegree: safeDegree }, { rootMode: 'degree', degree: safeDegree });
  }, [applyManualSelection]);

  const setQuality = useCallback((quality: HarmonyChordQuality) => {
    applyManualSelection({ selectedQuality: quality }, { quality });
  }, [applyManualSelection]);

  const toggleExtension = useCallback((extension: string) => {
    const selectedExtensions = manual.selectedExtensions.includes(extension)
      ? manual.selectedExtensions.filter((item) => item !== extension)
      : [...manual.selectedExtensions, extension].slice(0, 8);
    applyManualSelection({ selectedExtensions }, { extensions: selectedExtensions });
  }, [applyManualSelection, manual.selectedExtensions]);

  const setOctave = useCallback((delta: number) => {
    const selectedOctave = clamp(manual.selectedOctave + delta, 0, 8);
    applyManualSelection({ selectedOctave }, { octave: selectedOctave });
  }, [applyManualSelection, manual.selectedOctave]);

  const setInversion = useCallback((delta: number) => {
    const selectedInversion = clamp(manual.selectedInversion + delta, -4, 4);
    applyManualSelection({ selectedInversion }, { inversion: selectedInversion });
  }, [applyManualSelection, manual.selectedInversion]);

  const setSpread = useCallback((spread: number) => {
    const selectedSpread = clamp(spread, 0, 1);
    applyManualSelection({ selectedSpread }, { spread: selectedSpread });
  }, [applyManualSelection]);

  const setBassMode = useCallback((bassMode: HarmonyBassMode) => {
    applyManualSelection({ selectedBassMode: bassMode }, { bassMode });
  }, [applyManualSelection]);

  const handleManualKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextInputTarget(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const noteIndex = (HARMONY_NOTE_KEYS as readonly string[]).indexOf(key);
    if (noteIndex >= 0) {
      event.preventDefault();
      setRoot(noteIndex);
      return;
    }
    const slotIndex = (HARMONY_SLOT_TRIGGER_KEYS as readonly string[]).indexOf(key);
    if (slotIndex >= 0 && !manualLocked) {
      event.preventDefault();
      activateSlot(slotIndex);
      return;
    }
    const quality = QUICK_QUALITY_KEYS[key];
    if (quality) {
      event.preventDefault();
      setQuality(quality);
      return;
    }
    const extension = EXTENSION_KEYS.find((item) => item.key.toLowerCase() === key);
    if (extension) {
      event.preventDefault();
      toggleExtension(extension.value);
      return;
    }
    if (key === '.') {
      event.preventDefault();
      setOctave(-1);
    } else if (key === '/') {
      event.preventDefault();
      setOctave(1);
    }
  }, [activateSlot, manualLocked, setOctave, setQuality, setRoot, toggleExtension]);

  const activeIntentLabel = useMemo(() => {
    if (manual.slotTriggerMode && manual.activeSlotId !== null) {
      const slot = slots[manual.activeSlotId];
      return slot ? `Slot ${slot.id + 1} ${intentTitle(slot.intent)}` : 'Slot';
    }
    return intentTitle(manual.activeIntent ?? manual.auditionIntent ?? selectedBaseIntent('audition'));
  }, [manual.activeIntent, manual.activeSlotId, manual.auditionIntent, manual.slotTriggerMode, selectedBaseIntent, slots]);

  return (
    <div className="harmony-engine-panel">
      <div className="harmony-engine-header">
        <div>
          <div className="harmony-engine-title">Harmony Engine</div>
          <div className="harmony-engine-meta">
            {noteName(harmonyContext.rootMidi)} {harmonyContext.scaleName} · Bank {harmonyContext.bank} · Morph {Math.round(harmonyContext.morphPercent)}%
          </div>
        </div>
        <div className="harmony-engine-actions">
          <button
            type="button"
            className={`harmony-engine-action${manualOpen ? ' active' : ''}`}
            onClick={() => setManualOpen((open) => !open)}
          >
            Voicing
          </button>
          <button
            type="button"
            className={`harmony-engine-action${labOpen ? ' active' : ''}`}
            onClick={() => setLabOpen((open) => !open)}
          >
            Chord Lab
          </button>
        </div>
      </div>

      <div className="harmony-engine-status-grid">
        <div className="harmony-engine-status">
          <span>Current</span>
          <strong>{sourceLabel(resolvedFrame.activeSource)} · {intentTitle({ ...defaultHarmonyIntent('baseline', resolvedFrame.degree), quality: resolvedFrame.quality })}</strong>
          <em>{formatPool(resolvedFrame.currentNotePool)}</em>
        </div>
        <div className="harmony-engine-status">
          <span>Next</span>
          <strong>{sourceLabel(resolvedFrame.nextSource)}{resolvedFrame.nextStepIndex !== null ? ` · Step ${resolvedFrame.nextStepIndex + 1}` : ''}</strong>
          <em>{formatPool(resolvedFrame.nextNotePool)}</em>
        </div>
        <div className={`harmony-engine-status${manualLocked ? ' locked' : ''}`}>
          <span>Manual</span>
          <strong>{manualLocked ? 'Endpoint Locked' : activeIntentLabel}</strong>
          <em>{manualLocked ? 'Control and capture wait for morph endpoints' : `${manual.strength.toUpperCase()} · ${manual.mode}`}</em>
        </div>
      </div>

      {manualOpen && (
        <div
          className="harmony-popup harmony-manual-popup"
          tabIndex={0}
          onKeyDown={handleManualKeyDown}
          aria-label="Manual harmony voicing"
        >
          <div className="harmony-popup-header">
            <div>
              <span>Manual Voicing</span>
              <small>{manualLocked ? 'Audition only during morph' : 'Focused keyboard shortcuts are active'}</small>
            </div>
            <button type="button" className="harmony-subtle-button" onClick={clearManualControl} disabled={!canWriteState}>
              Clear
            </button>
          </div>

          <div className="harmony-control-row">
            <span className="harmony-row-label">Mode</span>
            {(['audition', 'control', 'capture'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`harmony-segment${manual.mode === mode ? ' active' : ''}`}
                onClick={() => setManualMode(mode)}
                disabled={!canWriteState || (mode !== 'audition' && manualLocked)}
              >
                {mode}
              </button>
            ))}
            <span className="harmony-row-label">Strength</span>
            {(['bias', 'force'] as const).map((strength) => (
              <button
                key={strength}
                type="button"
                className={`harmony-segment${manual.strength === strength ? ' active' : ''}`}
                onClick={() => setStrength(strength)}
                disabled={!canWriteState}
              >
                {strength}
              </button>
            ))}
          </div>

          <div className="harmony-key-grid note-grid">
            {NOTE_NAMES.map((name, index) => (
              <button
                key={name}
                type="button"
                className={`harmony-key${manual.selectedRootNote === index ? ' active' : ''}`}
                onClick={() => setRoot(index)}
                disabled={!canWriteState}
              >
                <span>{HARMONY_NOTE_KEYS[index]?.toUpperCase()}</span>
                <strong>{name}</strong>
              </button>
            ))}
          </div>

          <div className="harmony-degree-grid">
            {ROMAN_DEGREES.map((degree, index) => (
              <button
                key={degree}
                type="button"
                className={`harmony-degree${manual.selectedDegree === index ? ' active' : ''}`}
                onClick={() => setDegree(index)}
                disabled={!canWriteState}
              >
                {degree}
              </button>
            ))}
          </div>

          <div className="harmony-control-row">
            <span className="harmony-row-label">Chord</span>
            {QUALITY_OPTIONS.slice(1, 5).map((quality) => (
              <button
                key={quality.value}
                type="button"
                className={`harmony-chip${manual.selectedQuality === quality.value ? ' active' : ''}`}
                onClick={() => setQuality(quality.value)}
                disabled={!canWriteState}
              >
                <span>{quality.key}</span>
                {quality.label}
              </button>
            ))}
          </div>

          <div className="harmony-control-row">
            <span className="harmony-row-label">Extensions</span>
            {EXTENSION_KEYS.map((extension) => (
              <button
                key={extension.value}
                type="button"
                className={`harmony-chip${manual.selectedExtensions.includes(extension.value) ? ' active' : ''}`}
                onClick={() => toggleExtension(extension.value)}
                disabled={!canWriteState}
              >
                <span>{extension.key}</span>
                {extension.label}
              </button>
            ))}
          </div>

          <div className="harmony-compact-controls">
            <div className="harmony-stepper">
              <span>Octave</span>
              <button type="button" onClick={() => setOctave(-1)} disabled={!canWriteState}>.</button>
              <strong>{manual.selectedOctave}</strong>
              <button type="button" onClick={() => setOctave(1)} disabled={!canWriteState}>/</button>
            </div>
            <div className="harmony-stepper">
              <span>Inversion</span>
              <button type="button" onClick={() => setInversion(-1)} disabled={!canWriteState}>-</button>
              <strong>{manual.selectedInversion}</strong>
              <button type="button" onClick={() => setInversion(1)} disabled={!canWriteState}>+</button>
            </div>
            <label className="harmony-range-control">
              <span>Spread</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={manual.selectedSpread}
                onChange={(event) => setSpread(Number(event.target.value))}
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
                  onClick={() => setBassMode(mode.value)}
                  disabled={!canWriteState}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="harmony-slot-trigger-row">
            <span className="harmony-row-label">Slots</span>
            {slots.map((slot, index) => (
              <button
                key={slot.id}
                type="button"
                className={`harmony-slot-trigger${manual.activeSlotId === slot.id ? ' active' : ''}${slot.locked ? ' locked' : ''}`}
                onClick={() => activateSlot(slot.id)}
                disabled={!canWriteState || (manual.mode !== 'audition' && manualLocked)}
              >
                <span>{HARMONY_SLOT_TRIGGER_KEYS[index]?.toUpperCase()}</span>
                S{slot.id + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {labOpen && (
        <div className="harmony-popup harmony-lab-popup">
          <div className="harmony-popup-header">
            <div>
              <span>Chord Lab</span>
              <small>{writeLocked ? 'Editing waits for endpoint A or B' : `Editing endpoint ${harmonyContext.bank}`}</small>
            </div>
            <div className="harmony-lab-actions">
              <button type="button" className="harmony-subtle-button" onClick={generateSlotsAction} disabled={!canWriteState || writeLocked}>
                Slots
              </button>
              <button type="button" className="harmony-subtle-button" onClick={generateSequenceAction} disabled={!canWriteState || writeLocked}>
                Sequence
              </button>
              <button type="button" className="harmony-primary-button" onClick={generateBothAction} disabled={!canWriteState || writeLocked}>
                Generate
              </button>
            </div>
          </div>

          <div className="harmony-lab-section">
            <div className="harmony-lab-section-title">Slots</div>
            <div className="harmony-slot-grid">
              {slots.map((slot) => (
                <div key={slot.id} className={`harmony-slot-card${slot.locked ? ' locked' : ''}${manual.activeSlotId === slot.id ? ' active' : ''}`}>
                  <div className="harmony-card-topline">
                    <button type="button" onClick={() => activateSlot(slot.id)} disabled={!canWriteState}>
                      S{slot.id + 1}
                    </button>
                    <input
                      value={slot.name}
                      onChange={(event) => updateSlot(slot.id, { name: event.target.value })}
                      disabled={!canWriteState || writeLocked}
                      aria-label={`Slot ${slot.id + 1} name`}
                    />
                    <button
                      type="button"
                      className={slot.locked ? 'active' : ''}
                      onClick={() => updateSlot(slot.id, { locked: !slot.locked })}
                      disabled={!canWriteState || writeLocked}
                    >
                      {slot.locked ? 'Lock' : 'Open'}
                    </button>
                  </div>
                  <div className="harmony-card-value">{intentTitle(slot.intent)}</div>
                  <div className="harmony-card-actions">
                    <button type="button" onClick={() => activateSlot(slot.id)} disabled={!canWriteState}>
                      {manual.mode === 'capture' ? 'Capture' : manual.mode === 'control' ? 'Use' : 'Audition'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSlot(slot.id, { intent: defaultHarmonyIntent('slot', slot.id % 7) })}
                      disabled={!canWriteState || writeLocked || slot.locked}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="harmony-lab-section">
            <div className="harmony-lab-section-title">
              <span>Sequence</span>
              <button
                type="button"
                className={`harmony-simple-enable${harmonyContext.chordSequenceEnabled ? ' on' : ''}`}
                onClick={() => setSequenceEnabled(!harmonyContext.chordSequenceEnabled)}
                disabled={!canWriteState}
              >
                {harmonyContext.chordSequenceEnabled ? 'ON' : 'OFF'}
              </button>
              <button type="button" className="harmony-subtle-button" onClick={commitBaselineAction} disabled={!canWriteState || writeLocked}>
                Commit Baseline
              </button>
            </div>
            <div className="harmony-sequence-grid">
              {sequence.map((step) => (
                <div
                  key={step.id}
                  className={`harmony-sequence-card${step.enabled ? '' : ' muted'}${step.locked ? ' locked' : ''}${harmonyContext.chordSequenceStepIndex === step.id ? ' active' : ''}`}
                >
                  <div className="harmony-card-topline">
                    <button
                      type="button"
                      className={step.enabled ? 'active' : ''}
                      onClick={() => updateStep(step.id, { enabled: !step.enabled })}
                      disabled={!canWriteState || writeLocked}
                    >
                      {step.id + 1}
                    </button>
                    <strong>{sequenceStepTitle(step, slots)}</strong>
                    <button
                      type="button"
                      className={step.locked ? 'active' : ''}
                      onClick={() => updateStep(step.id, { locked: !step.locked })}
                      disabled={!canWriteState || writeLocked}
                    >
                      {step.locked ? 'Lock' : 'Open'}
                    </button>
                  </div>
                  <div className="harmony-sequence-controls">
                    <select
                      value={step.mode}
                      onChange={(event) => updateStep(step.id, { mode: event.target.value as HarmonySequenceStepMode })}
                      disabled={!canWriteState || writeLocked}
                      aria-label={`Step ${step.id + 1} mode`}
                    >
                      {SEQUENCE_MODES.map((mode) => (
                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                      ))}
                    </select>
                    <select
                      value={step.degree}
                      onChange={(event) => updateStep(step.id, { degree: Number(event.target.value), intent: null })}
                      disabled={!canWriteState || writeLocked}
                      aria-label={`Step ${step.id + 1} degree`}
                    >
                      {ROMAN_DEGREES.map((degree, index) => (
                        <option key={degree} value={index}>{degree}</option>
                      ))}
                    </select>
                    <select
                      value={step.quality}
                      onChange={(event) => updateStep(step.id, { quality: event.target.value as HarmonyChordQuality, intent: null })}
                      disabled={!canWriteState || writeLocked}
                      aria-label={`Step ${step.id + 1} quality`}
                    >
                      {QUALITY_OPTIONS.map((quality) => (
                        <option key={quality.value} value={quality.value}>{quality.label}</option>
                      ))}
                    </select>
                    <select
                      value={step.slotId ?? ''}
                      onChange={(event) => updateStep(step.id, { slotId: event.target.value === '' ? null : Number(event.target.value) })}
                      disabled={!canWriteState || writeLocked || (step.mode !== 'slotCopy' && step.mode !== 'slotFollow')}
                      aria-label={`Step ${step.id + 1} slot`}
                    >
                      <option value="">Slot</option>
                      {slots.map((slot) => (
                        <option key={slot.id} value={slot.id}>S{slot.id + 1}</option>
                      ))}
                    </select>
                  </div>
                  <label className="harmony-probability">
                    <span>Prob</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={step.probability}
                      onChange={(event) => updateStep(step.id, { probability: Number(event.target.value) })}
                      disabled={!canWriteState || writeLocked}
                    />
                    <strong>{Math.round(step.probability * 100)}</strong>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
