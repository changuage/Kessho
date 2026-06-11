import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  loadLead4opFMPreset,
  morphPresets,
  playLead4opFMNote,
  type Lead4opFMAlgorithm,
  type Lead4opFMModulator,
  type Lead4opFMParams,
  type Lead4opFMPitchEnv,
  type Lead4opFMPreset,
  type Lead4opFMWaveform,
} from '../../audio/lead4opfm';
import { SliderPrimitive } from '../sliderSystem';

type LeadPresetLibrary = 'stock' | 'user' | 'cloud';
type ApplyMode = 'slot' | 'copy' | 'overwrite';
type EditorTab = 'shape' | 'tone' | 'operators';
type AuditionMode = 'pre' | 'post';
type SequencePattern = 'ascending' | 'descending' | 'updown' | 'chord';
type OperatorKey = 'mod1' | 'mod2' | 'mod3' | 'mod4';
type OperatorField = keyof Lead4opFMModulator;
type NumericOperatorField = Exclude<OperatorField, 'waveform'>;
type FilterType = NonNullable<Lead4opFMParams['filter']['type']>;
type LfoTarget = NonNullable<NonNullable<Lead4opFMParams['lfo']>['target']>;
type PitchEnvTarget = NonNullable<NonNullable<Lead4opFMParams['pitchEnv']>['target']>;
type TransientType = Lead4opFMParams['transient']['type'];

export interface Lead4opFMEditorApplyRequest {
  mode: ApplyMode;
  name: string;
  preset: Lead4opFMPreset;
  sourceName?: string;
}

interface Lead4opFMEditorOverlayProps {
  open: boolean;
  presetId: string;
  slotLabel: string;
  sourceLabel: string;
  accentColor: string;
  library?: LeadPresetLibrary;
  canOverwrite?: boolean;
  overwriteLabel?: string;
  slotOptions?: Array<{ key: string; label: string; accentColor: string }>;
  activeSlotKey?: string;
  onSlotChange?: (slotKey: string) => void;
  onClose: () => void;
  onApply: (request: Lead4opFMEditorApplyRequest) => Promise<void>;
}

interface NumberControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  compact?: boolean;
  logarithmic?: boolean;
  onChange: (value: number) => void;
}

const EDITOR_TABS: Array<{ id: EditorTab; label: string }> = [
  { id: 'shape', label: 'Shape' },
  { id: 'tone', label: 'Tone / Filter' },
  { id: 'operators', label: 'Operators' },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SEQUENCE_PATTERNS: Array<{ id: SequencePattern; label: string }> = [
  { id: 'ascending', label: 'Asc' },
  { id: 'descending', label: 'Desc' },
  { id: 'updown', label: 'Up/Down' },
  { id: 'chord', label: 'Chord' },
];

const OPERATOR_KEYS: OperatorKey[] = ['mod1', 'mod2', 'mod3', 'mod4'];

const MAIN_OPERATOR_FIELDS: Array<{
  key: NumericOperatorField;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}> = [
  { key: 'ratio', label: 'Ratio', min: 0.125, max: 16, step: 0.001, defaultValue: 1 },
  { key: 'index', label: 'Index', min: 0, max: 5, step: 0.01, defaultValue: 0 },
  { key: 'decay', label: 'Decay', min: 0.01, max: 4, step: 0.01, defaultValue: 0.3 },
  { key: 'sustain', label: 'Sustain', min: 0, max: 1, step: 0.01, defaultValue: 0.1 },
  { key: 'level', label: 'Level', min: 0, max: 1, step: 0.01, defaultValue: 1 },
  { key: 'feedback', label: 'Feedback', min: 0, max: 1, step: 0.01, defaultValue: 0 },
  { key: 'detune', label: 'Detune', min: -50, max: 50, step: 1, defaultValue: 0 },
  { key: 'envRate', label: 'Env rate', min: 0.1, max: 8, step: 0.01, defaultValue: 1 },
];

const TIMING_OPERATOR_FIELDS: Array<{
  key: NumericOperatorField;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}> = [
  { key: 'modAttack', label: 'Mod attack', min: 0, max: 2, step: 0.001, defaultValue: 0 },
  { key: 'modDelay', label: 'Mod delay', min: 0, max: 2, step: 0.001, defaultValue: 0 },
];

const V2_OPERATOR_FIELDS: Array<{
  key: NumericOperatorField;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}> = [
  { key: 'fixedHz', label: 'Fixed Hz', min: 0, max: 20000, step: 1, defaultValue: 0, unit: 'Hz' },
  { key: 'keyTrack', label: 'Key track', min: 0, max: 1, step: 0.01, defaultValue: 1 },
  { key: 'velocityToIndex', label: 'Vel Index', min: 0, max: 1, step: 0.01, defaultValue: 0 },
  { key: 'velocityToLevel', label: 'Vel Level', min: 0, max: 1, step: 0.01, defaultValue: 0 },
  { key: 'modRelease', label: 'Mod release', min: 0, max: 10, step: 0.01, defaultValue: 0, unit: 's' },
];

const ALGORITHMS: Array<{ value: Lead4opFMAlgorithm; label: string }> = [
  { value: 'dx17', label: 'DX7 ALG17' },
  { value: 'parallel', label: 'Additive carriers' },
  { value: 'stack', label: 'Stacked towers' },
  { value: 'split', label: 'Branched split' },
  { value: 'cross', label: 'Cross-coupled' },
];

const FILTER_TYPES: FilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking'];
const WAVEFORMS: Lead4opFMWaveform[] = ['sine', 'triangle', 'sawtooth', 'square'];
const LFO_TARGETS: LfoTarget[] = ['all', 'mod1', 'mod2', 'mod3', 'mod4', 'filter', 'pitch', 'detune', 'amp', 'pan', 'none'];
const LFO_TARGET_LABELS: Record<LfoTarget, string> = {
  all: 'All operators',
  mod1: 'Mod 1',
  mod2: 'Mod 2',
  mod3: 'Mod 3',
  mod4: 'Mod 4',
  filter: 'Filter',
  pitch: 'Pitch',
  detune: 'Detune',
  amp: 'Amp Tremolo',
  pan: 'Pan Motion',
  none: 'None',
};
const PITCH_ENV_TARGETS: PitchEnvTarget[] = ['carriers', 'carrier1', 'carrier2', 'all'];
const TRANSIENT_TYPES: TransientType[] = ['white', 'pink', 'brown', 'filtered'];

const DEFAULT_TRANSIENT: Lead4opFMParams['transient'] = {
  click: 0,
  noise: 0,
  duration: 20,
  decay: 50,
  filter: 4000,
  type: 'white',
};

const DEFAULT_FILTER: Lead4opFMParams['filter'] = {
  freq: 4000,
  q: 0.7,
  type: 'lowpass',
  envAttack: 0,
  envDecay: 0,
  envSustain: 1,
  envRelease: 0,
  envDepth: 0,
};

const DEFAULT_LFO: NonNullable<Lead4opFMParams['lfo']> = {
  rate: 0,
  depth: 0,
  target: 'all',
};

const DEFAULT_PITCH_ENV: Required<Lead4opFMPitchEnv> = {
  depthCents: 0,
  attack: 0,
  decay: 0.08,
  target: 'carriers',
  velocityDepth: 0,
};

function clonePreset(preset: Lead4opFMPreset): Lead4opFMPreset {
  return JSON.parse(JSON.stringify(preset)) as Lead4opFMPreset;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatControlValue(value: number, unit?: string): string {
  const abs = Math.abs(value);
  const formatted = abs >= 100 ? Math.round(value).toString()
    : abs >= 10 ? value.toFixed(1)
      : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return unit ? `${formatted}${unit}` : formatted;
}

function stepDecimals(step: number): number {
  const stepText = String(step);
  if (!stepText.includes('.')) return 0;
  return Math.min(6, stepText.split('.')[1]?.length ?? 0);
}

function quantizeControlValue(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const clamped = clamp(value, min, max);
  if (!Number.isFinite(step) || step <= 0) return clamped;
  const quantized = Math.round((clamped - min) / step) * step + min;
  return clamp(Number(quantized.toFixed(stepDecimals(step))), min, max);
}

function controlValueToPercent(value: number, min: number, max: number, logarithmic = false): number {
  if (max <= min) return 0;
  const clamped = clamp(value, min, max);
  if (logarithmic && min > 0 && max > 0) {
    const minLog = Math.log(min);
    const maxLog = Math.log(max);
    return clamp(((Math.log(clamped) - minLog) / (maxLog - minLog)) * 100, 0, 100);
  }
  return clamp(((clamped - min) / (max - min)) * 100, 0, 100);
}

function percentToControlValue(percent: number, min: number, max: number, step: number, logarithmic = false): number {
  const normalized = clamp(percent, 0, 100) / 100;
  const raw = logarithmic && min > 0 && max > 0
    ? Math.exp(Math.log(min) + normalized * (Math.log(max) - Math.log(min)))
    : min + normalized * (max - min);
  return quantizeControlValue(raw, min, max, step);
}

function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

function generateSequencePattern(pattern: SequencePattern, octave = 4): Array<{ note: number; octave: number }> {
  const offsetsByPattern: Record<SequencePattern, number[]> = {
    ascending: [0, 2, 4, 5, 7, 9, 11, 12],
    descending: [12, 11, 9, 7, 5, 4, 2, 0],
    updown: [0, 2, 4, 7, 12, 7, 4, 2],
    chord: [0, 4, 7, 12, 7, 4, 0, 12],
  };

  return offsetsByPattern[pattern].map((offset) => ({
    note: offset % 12,
    octave: octave + Math.floor(offset / 12),
  }));
}

function normalizeOperator(operator: Lead4opFMModulator | undefined, index: number): Lead4opFMModulator {
  const fallbackRatio = index === 0 ? 1 : index + 1;
  return {
    ratio: operator?.ratio ?? fallbackRatio,
    index: operator?.index ?? 0,
    decay: operator?.decay ?? 0.3,
    sustain: operator?.sustain ?? (index === 2 ? 0.02 : index === 1 ? 0.05 : 0.1),
    level: operator?.level ?? 1,
    feedback: operator?.feedback ?? 0,
    detune: operator?.detune ?? 0,
    envRate: operator?.envRate ?? 1,
    modAttack: operator?.modAttack ?? 0,
    modDelay: operator?.modDelay ?? 0,
    waveform: operator?.waveform ?? 'sine',
    fixedHz: operator?.fixedHz ?? 0,
    keyTrack: operator?.keyTrack ?? 1,
    velocityToIndex: operator?.velocityToIndex ?? 0,
    velocityToLevel: operator?.velocityToLevel ?? 0,
    modRelease: operator?.modRelease ?? 0,
  };
}

function normalizeLeadPresetForEditor(preset: Lead4opFMPreset): Lead4opFMPreset {
  const cloned = clonePreset(preset);
  const paramsWithLegacy = cloned.params as Lead4opFMParams & {
    unison?: { voices?: number; detune?: number };
  };

  cloned.params = {
    ...cloned.params,
    mod1: normalizeOperator(cloned.params.mod1, 0),
    mod2: normalizeOperator(cloned.params.mod2, 1),
    mod3: normalizeOperator(cloned.params.mod3, 2),
    mod4: normalizeOperator(cloned.params.mod4, 3),
    envelope: {
      attack: cloned.params.envelope?.attack ?? 0.01,
      decay: cloned.params.envelope?.decay ?? 0.8,
      sustain: cloned.params.envelope?.sustain ?? 0.3,
      release: cloned.params.envelope?.release ?? 2,
    },
    filter: {
      ...DEFAULT_FILTER,
      ...(cloned.params.filter ?? {}),
      type: cloned.params.filter?.type ?? 'lowpass',
    },
    transient: {
      ...DEFAULT_TRANSIENT,
      ...(cloned.params.transient ?? {}),
      type: cloned.params.transient?.type ?? 'white',
    },
    lfo: {
      ...DEFAULT_LFO,
      ...(cloned.params.lfo ?? {}),
      target: cloned.params.lfo?.target ?? 'all',
    },
    carrier1Waveform: cloned.params.carrier1Waveform ?? 'sine',
    carrier2Waveform: cloned.params.carrier2Waveform ?? 'sine',
    stereoSpread: cloned.params.stereoSpread ?? 0,
    pitchEnv: {
      ...DEFAULT_PITCH_ENV,
      ...(cloned.params.pitchEnv ?? {}),
      target: cloned.params.pitchEnv?.target ?? DEFAULT_PITCH_ENV.target,
    },
    unisonVoices: cloned.params.unisonVoices ?? paramsWithLegacy.unison?.voices ?? 1,
    unisonDetune: cloned.params.unisonDetune ?? paramsWithLegacy.unison?.detune ?? 0,
    drive: cloned.params.drive ?? 0,
  };

  delete (cloned.params as Lead4opFMParams & { unison?: unknown }).unison;
  return cloned;
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  compact = false,
  logarithmic = false,
  onChange,
}: NumberControlProps) {
  const safeValue = quantizeControlValue(value, min, max, step);
  const valuePercent = controlValueToPercent(safeValue, min, max, logarithmic);
  const commitValue = useCallback((rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) return;
    onChange(quantizeControlValue(parsed, min, max, step));
  }, [max, min, onChange, step]);

  return (
    <div className={`lead-editor-control${compact ? ' compact' : ''}`}>
      <span className="lead-editor-control-inputs">
        <SliderPrimitive
          className="app-slider-group lead-editor-slider"
          label={label}
          mode="single"
          value={valuePercent}
          hero="var(--lead-editor-accent)"
          variant="full"
          density="compact"
          displayValue={formatControlValue(safeValue, unit)}
          formatValue={(percent) => formatControlValue(percentToControlValue(percent, min, max, step, logarithmic), unit)}
          onValueChange={(percent) => {
            onChange(percentToControlValue(percent, min, max, step, logarithmic));
          }}
        />
        <input
          className="lead-editor-value-input"
          aria-label={`${label} value`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          onChange={(event) => commitValue(event.currentTarget.value)}
        />
      </span>
    </div>
  );
}

export function Lead4opFMEditorOverlay({
  open,
  presetId,
  slotLabel,
  sourceLabel,
  accentColor,
  library = 'stock',
  canOverwrite = false,
  overwriteLabel = 'Overwrite saved',
  slotOptions = [],
  activeSlotKey,
  onSlotChange,
  onClose,
  onApply,
}: Lead4opFMEditorOverlayProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('shape');
  const [auditionMode, setAuditionMode] = useState<AuditionMode>('post');
  const [sequencePattern, setSequencePattern] = useState<SequencePattern>('ascending');
  const [sequenceBpm, setSequenceBpm] = useState(100);
  const [sequencePlaying, setSequencePlaying] = useState(false);
  const [sequenceStep, setSequenceStep] = useState(-1);
  const [mutedSequenceSteps, setMutedSequenceSteps] = useState<Set<number>>(() => new Set());
  const [draft, setDraft] = useState<Lead4opFMPreset | null>(null);
  const [original, setOriginal] = useState<Lead4opFMPreset | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingMode, setSavingMode] = useState<ApplyMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const auditionGainRef = useRef<GainNode | null>(null);
  const sequenceIndexRef = useRef(0);
  const openRef = useRef(open);
  const draftRef = useRef<Lead4opFMPreset | null>(null);
  const originalRef = useRef<Lead4opFMPreset | null>(null);
  const auditionModeRef = useRef<AuditionMode>(auditionMode);
  const mutedSequenceStepsRef = useRef<Set<number>>(mutedSequenceSteps);

  const sequenceNotes = useMemo(() => generateSequencePattern(sequencePattern, 4), [sequencePattern]);

  const closeAuditionContext = useCallback(() => {
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    auditionGainRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    openRef.current = open;
    if (!open) {
      setSequencePlaying(false);
      setSequenceStep(-1);
      sequenceIndexRef.current = 0;
      closeAuditionContext();
    }
  }, [closeAuditionContext, open]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    originalRef.current = original;
  }, [original]);

  useEffect(() => {
    auditionModeRef.current = auditionMode;
  }, [auditionMode]);

  useEffect(() => {
    mutedSequenceStepsRef.current = mutedSequenceSteps;
  }, [mutedSequenceSteps]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveTab('shape');
    setAuditionMode('post');
    setSequencePlaying(false);
    setSequenceStep(-1);
    sequenceIndexRef.current = 0;

    loadLead4opFMPreset(presetId)
      .then((preset) => {
        if (cancelled) return;
        const normalized = normalizeLeadPresetForEditor(preset);
        setDraft(normalized);
        setOriginal(normalized);
        setNameDraft(normalized.name);
      })
      .catch((loadError) => {
        console.warn('Failed to load Lead4opFM preset for editor:', loadError);
        if (!cancelled) {
          setDraft(null);
          setOriginal(null);
          setNameDraft('');
          setError('Preset failed to load');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, presetId]);

  useEffect(() => {
    setMutedSequenceSteps(new Set());
    setSequenceStep(-1);
    sequenceIndexRef.current = 0;
  }, [sequencePattern]);

  useEffect(() => () => {
    closeAuditionContext();
  }, [closeAuditionContext]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      setSequencePlaying(false);
      setSequenceStep(-1);
      sequenceIndexRef.current = 0;
      closeAuditionContext();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [closeAuditionContext]);

  const isDirty = useMemo(() => {
    if (!draft || !original) return false;
    return nameDraft.trim() !== original.name
      || JSON.stringify(draft) !== JSON.stringify(original);
  }, [draft, nameDraft, original]);

  const getAuditionPreset = useCallback(() => (
    auditionModeRef.current === 'pre' ? originalRef.current : draftRef.current
  ), []);

  const ensureAuditionContext = useCallback(async () => {
    const AudioContextCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('AudioContext unavailable');

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }
    const audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') await audioContext.resume();

    if (!auditionGainRef.current) {
      const gain = audioContext.createGain();
      gain.gain.value = 0.68;
      gain.connect(audioContext.destination);
      auditionGainRef.current = gain;
    }

    return {
      audioContext,
      gain: auditionGainRef.current,
    };
  }, []);

  const playAuditionFrequency = useCallback(async (frequency: number, velocity = 0.75) => {
    const preset = getAuditionPreset();
    if (!preset || !openRef.current) return;

    try {
      const { audioContext, gain } = await ensureAuditionContext();
      if (!openRef.current || audioContext.state === 'closed') return;
      const morphed = morphPresets(preset, preset, 0, 'presetA');
      playLead4opFMNote(audioContext, gain, frequency, velocity, morphed, 0.36);
    } catch (auditionError) {
      console.warn('Failed to play Lead4opFM audition note:', auditionError);
      setError('Audition failed');
    }
  }, [ensureAuditionContext, getAuditionPreset]);

  const playAuditionNote = useCallback((note: number, octave: number, velocity = 0.75) => {
    void playAuditionFrequency(midiToFrequency((octave + 1) * 12 + note), velocity);
  }, [playAuditionFrequency]);

  const toggleSequenceStep = useCallback((stepIndex: number) => {
    setMutedSequenceSteps((previous) => {
      const next = new Set(previous);
      if (next.has(stepIndex)) next.delete(stepIndex);
      else next.add(stepIndex);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open || !sequencePlaying) {
      setSequenceStep(-1);
      return undefined;
    }

    const tick = () => {
      const stepIndex = sequenceIndexRef.current % sequenceNotes.length;
      const note = sequenceNotes[stepIndex];
      setSequenceStep(stepIndex);
      if (note && !mutedSequenceStepsRef.current.has(stepIndex)) {
        playAuditionNote(note.note, note.octave, 0.72);
      }
      sequenceIndexRef.current = (stepIndex + 1) % sequenceNotes.length;
    };

    sequenceIndexRef.current = 0;
    tick();
    const intervalId = window.setInterval(tick, Math.max(90, 60000 / sequenceBpm));
    return () => window.clearInterval(intervalId);
  }, [open, playAuditionNote, sequenceBpm, sequenceNotes, sequencePlaying]);

  const updateDraft = useCallback((updater: (preset: Lead4opFMPreset) => Lead4opFMPreset) => {
    setDraft((previous) => {
      if (!previous) return previous;
      return normalizeLeadPresetForEditor(updater(previous));
    });
  }, []);

  const updateParam = useCallback(<K extends keyof Lead4opFMParams>(
    key: K,
    value: Lead4opFMParams[K],
  ) => {
    updateDraft((preset) => ({
      ...preset,
      params: {
        ...preset.params,
        [key]: value,
      },
    }));
  }, [updateDraft]);

  const updateOperator = useCallback(<K extends OperatorField>(operatorKey: OperatorKey, field: K, value: Lead4opFMModulator[K]) => {
    updateDraft((preset) => ({
      ...preset,
      params: {
        ...preset.params,
        [operatorKey]: {
          ...preset.params[operatorKey],
          [field]: value,
        },
      },
    }));
  }, [updateDraft]);

  const updatePitchEnv = useCallback(<K extends keyof Lead4opFMPitchEnv>(field: K, value: Lead4opFMPitchEnv[K]) => {
    updateDraft((preset) => ({
      ...preset,
      params: {
        ...preset.params,
        pitchEnv: {
          ...DEFAULT_PITCH_ENV,
          ...(preset.params.pitchEnv ?? {}),
          [field]: value,
        },
      },
    }));
  }, [updateDraft]);

  const updateEnvelope = useCallback((field: keyof Lead4opFMParams['envelope'], value: number) => {
    updateDraft((preset) => ({
      ...preset,
      params: {
        ...preset.params,
        envelope: {
          ...preset.params.envelope,
          [field]: value,
        },
      },
    }));
  }, [updateDraft]);

  const updateFilter = useCallback((field: keyof Lead4opFMParams['filter'], value: number | FilterType) => {
    updateDraft((preset) => ({
      ...preset,
      params: {
        ...preset.params,
        filter: {
          ...preset.params.filter,
          [field]: value,
        },
      },
    }));
  }, [updateDraft]);

  const updateTransient = useCallback((field: keyof Lead4opFMParams['transient'], value: number | TransientType) => {
    updateDraft((preset) => ({
      ...preset,
      params: {
        ...preset.params,
        transient: {
          ...preset.params.transient,
          [field]: value,
        },
      },
    }));
  }, [updateDraft]);

  const updateLfo = useCallback((field: keyof NonNullable<Lead4opFMParams['lfo']>, value: number | LfoTarget) => {
    updateDraft((preset) => ({
      ...preset,
      params: {
        ...preset.params,
        lfo: {
          ...(preset.params.lfo ?? DEFAULT_LFO),
          [field]: value,
        },
      },
    }));
  }, [updateDraft]);

  const updateXY = useCallback((field: keyof Lead4opFMPreset['xy'], value: number) => {
    updateDraft((preset) => ({
      ...preset,
      xy: {
        ...preset.xy,
        [field]: value,
      },
    }));
  }, [updateDraft]);

  const handleRevert = useCallback(() => {
    if (!original) return;
    const restored = clonePreset(original);
    setDraft(restored);
    setNameDraft(restored.name);
    setError(null);
  }, [original]);

  const handleSlotChange = useCallback((slotKey: string) => {
    if (slotKey === activeSlotKey) return;
    if (isDirty) {
      setError('Apply, save, or revert before switching slots');
      return;
    }
    setError(null);
    onSlotChange?.(slotKey);
  }, [activeSlotKey, isDirty, onSlotChange]);

  const handleApply = useCallback(async (mode: ApplyMode) => {
    if (!draft) return;
    const trimmedName = nameDraft.trim();
    if (mode === 'copy' && !trimmedName) {
      setError('Name required');
      return;
    }
    const applyName = trimmedName || original?.name || draft.name || 'Lead Preset';

    setSavingMode(mode);
    setError(null);
    try {
      await onApply({
        mode,
        name: applyName,
        sourceName: original?.name,
        preset: normalizeLeadPresetForEditor({
          ...draft,
          name: applyName,
        }),
      });
      onClose();
    } catch (applyError) {
      console.warn('Failed to apply Lead4opFM edit:', applyError);
      setError('Preset failed to save');
    } finally {
      setSavingMode(null);
    }
  }, [draft, nameDraft, onApply, onClose, original]);

  if (!open) return null;

  const panelStyle = {
    '--lead-editor-accent': accentColor,
  } as CSSProperties;

  const statusText = loading ? 'Loading'
    : savingMode ? 'Saving'
      : error ?? (isDirty ? 'Edited' : library);

  return (
    <div className="lead-editor-backdrop" role="presentation">
      <section
        className="lead-editor-shell"
        role="dialog"
        aria-modal="true"
        aria-label={`${sourceLabel} ${slotLabel} Lead4opFM editor`}
        style={panelStyle}
      >
        <header className="lead-editor-header">
          <div className="lead-editor-title-block">
            <span className="lead-editor-kicker">{sourceLabel} / {slotLabel}</span>
            {slotOptions.length > 1 && (
              <div className="lead-editor-slot-switch" aria-label={`${sourceLabel} slot selector`}>
                {slotOptions.map((slot) => (
                  <button
                    key={slot.key}
                    className={`lead-editor-slot-pill${slot.key === activeSlotKey ? ' active' : ''}`}
                    type="button"
                    style={{ '--slot-accent': slot.accentColor } as CSSProperties}
                    onClick={() => handleSlotChange(slot.key)}
                    disabled={savingMode !== null}
                  >
                    {slot.label.replace(/^Slot\s+/i, '')}
                  </button>
                ))}
              </div>
            )}
            <input
              className="lead-editor-name"
              aria-label="Preset name"
              value={nameDraft}
              disabled={loading || !draft}
              onChange={(event) => setNameDraft(event.currentTarget.value)}
            />
          </div>
          <div className="lead-editor-header-actions">
            <span className={`lead-editor-status${error ? ' error' : ''}`}>{statusText}</span>
            <button className="lead-editor-plain-btn" type="button" onClick={handleRevert} disabled={!isDirty || !original}>
              Revert
            </button>
            <button className="lead-editor-plain-btn" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <section className="lead-editor-audition" aria-label="Lead preset audition">
          <div className="lead-editor-compare">
            {(['pre', 'post'] as AuditionMode[]).map((mode) => (
              <button
                key={mode}
                className={`lead-editor-compare-btn${auditionMode === mode ? ' active' : ''}`}
                type="button"
                onClick={() => setAuditionMode(mode)}
                disabled={loading || !draft || !original}
              >
                {mode === 'pre' ? 'Pre' : 'Post'}
              </button>
            ))}
          </div>
          <div className="lead-editor-seq-main">
            <button
              className="lead-editor-plain-btn"
              type="button"
              onClick={() => playAuditionNote(0, 4, 0.8)}
              disabled={loading || !draft}
            >
              Play note
            </button>
            <button
              className={`lead-editor-plain-btn${sequencePlaying ? ' active' : ''}`}
              type="button"
              onClick={() => setSequencePlaying((playing) => !playing)}
              disabled={loading || !draft}
            >
              {sequencePlaying ? 'Stop seq' : 'Play seq'}
            </button>
            <label className="lead-editor-seq-bpm">
              <span>BPM</span>
              <input
                type="range"
                min={60}
                max={180}
                step={1}
                value={sequenceBpm}
                onChange={(event) => setSequenceBpm(Number(event.currentTarget.value))}
              />
              <strong>{sequenceBpm}</strong>
            </label>
          </div>
          <div className="lead-editor-seq-patterns">
            {SEQUENCE_PATTERNS.map((pattern) => (
              <button
                key={pattern.id}
                className={`lead-editor-seq-pattern${sequencePattern === pattern.id ? ' active' : ''}`}
                type="button"
                onClick={() => setSequencePattern(pattern.id)}
              >
                {pattern.label}
              </button>
            ))}
          </div>
          <div className="lead-editor-seq-grid">
            {sequenceNotes.map((note, index) => {
              const muted = mutedSequenceSteps.has(index);
              return (
                <button
                  key={`${sequencePattern}:${index}`}
                  className={`lead-editor-seq-step${muted ? '' : ' active'}${sequenceStep === index ? ' current' : ''}`}
                  type="button"
                  onClick={() => toggleSequenceStep(index)}
                  title={muted ? 'Muted step' : 'Active step'}
                >
                  <span>{NOTE_NAMES[note.note]}</span>
                  <small>{note.octave}</small>
                </button>
              );
            })}
          </div>
        </section>

        <nav className="lead-editor-tabs" aria-label="Lead4opFM parameter sections">
          {EDITOR_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`lead-editor-tab${activeTab === tab.id ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="lead-editor-body">
          {loading && <div className="lead-editor-empty">Loading preset</div>}
          {!loading && !draft && <div className="lead-editor-empty">{error ?? 'Preset unavailable'}</div>}

          {draft && activeTab === 'shape' && (
            <div className="lead-editor-section">
              <div className="lead-editor-subsection">
                <div className="lead-editor-section-head">
                  <span>Transient</span>
                  <select value={draft.params.transient.type} onChange={(event) => updateTransient('type', event.currentTarget.value as TransientType)}>
                    {TRANSIENT_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="lead-editor-control-grid">
                  <NumberControl label="Click" value={draft.params.transient.click} min={0} max={1} step={0.01} onChange={(value) => updateTransient('click', value)} />
                  <NumberControl label="Noise" value={draft.params.transient.noise} min={0} max={1} step={0.01} onChange={(value) => updateTransient('noise', value)} />
                  <NumberControl label="Duration" value={draft.params.transient.duration} min={1} max={200} step={1} unit="ms" onChange={(value) => updateTransient('duration', value)} />
                  <NumberControl label="Decay" value={draft.params.transient.decay} min={1} max={300} step={1} onChange={(value) => updateTransient('decay', value)} />
                  <NumberControl label="Filter" value={draft.params.transient.filter} min={100} max={12000} step={10} unit="Hz" logarithmic onChange={(value) => updateTransient('filter', value)} />
                </div>
              </div>

              <div className="lead-editor-subsection">
                <div className="lead-editor-subsection-title">Envelope</div>
                <div className="lead-editor-control-grid">
                  <NumberControl label="Attack" value={draft.params.envelope.attack} min={0.001} max={2} step={0.001} unit="s" onChange={(value) => updateEnvelope('attack', value)} />
                  <NumberControl label="Decay" value={draft.params.envelope.decay} min={0.01} max={4} step={0.01} unit="s" onChange={(value) => updateEnvelope('decay', value)} />
                  <NumberControl label="Sustain" value={draft.params.envelope.sustain} min={0} max={1} step={0.01} onChange={(value) => updateEnvelope('sustain', value)} />
                  <NumberControl label="Release" value={draft.params.envelope.release} min={0.01} max={8} step={0.01} unit="s" onChange={(value) => updateEnvelope('release', value)} />
                </div>
              </div>

              <div className="lead-editor-subsection">
                <div className="lead-editor-section-head">
                  <span>Pitch Envelope</span>
                  <select value={draft.params.pitchEnv?.target ?? DEFAULT_PITCH_ENV.target} onChange={(event) => updatePitchEnv('target', event.currentTarget.value as PitchEnvTarget)}>
                    {PITCH_ENV_TARGETS.map((target) => (
                      <option key={target} value={target}>{target}</option>
                    ))}
                  </select>
                </div>
                <div className="lead-editor-control-grid">
                  <NumberControl label="Depth" value={draft.params.pitchEnv?.depthCents ?? 0} min={-240} max={240} step={1} unit="ct" onChange={(value) => updatePitchEnv('depthCents', value)} />
                  <NumberControl label="Attack" value={draft.params.pitchEnv?.attack ?? 0} min={0} max={1} step={0.001} unit="s" onChange={(value) => updatePitchEnv('attack', value)} />
                  <NumberControl label="Decay" value={draft.params.pitchEnv?.decay ?? DEFAULT_PITCH_ENV.decay} min={0.001} max={3} step={0.001} unit="s" onChange={(value) => updatePitchEnv('decay', value)} />
                  <NumberControl label="Velocity Depth" value={draft.params.pitchEnv?.velocityDepth ?? 0} min={0} max={1} step={0.01} onChange={(value) => updatePitchEnv('velocityDepth', value)} />
                </div>
              </div>

              <div className="lead-editor-subsection">
                <div className="lead-editor-subsection-title">Output</div>
                <div className="lead-editor-control-grid">
                  <NumberControl label="Gain" value={draft.params.gain} min={0} max={1.5} step={0.01} onChange={(value) => updateParam('gain', value)} />
                  <NumberControl label="X level" value={draft.xy.xLevel} min={0} max={1.5} step={0.01} onChange={(value) => updateXY('xLevel', value)} />
                  <NumberControl label="Y level" value={draft.xy.yLevel} min={0} max={1.5} step={0.01} onChange={(value) => updateXY('yLevel', value)} />
                  <NumberControl label="X pan" value={draft.xy.xPan} min={-1} max={1} step={0.01} onChange={(value) => updateXY('xPan', value)} />
                  <NumberControl label="Y pan" value={draft.xy.yPan} min={-1} max={1} step={0.01} onChange={(value) => updateXY('yPan', value)} />
                </div>
              </div>
            </div>
          )}

          {draft && activeTab === 'tone' && (
            <div className="lead-editor-section">
              <div className="lead-editor-section-head">
                <span>Algorithm</span>
                <select
                  value={draft.algorithm}
                  onChange={(event) => updateDraft((preset) => ({
                    ...preset,
                    algorithm: event.currentTarget.value as Lead4opFMAlgorithm,
                  }))}
                >
                  {ALGORITHMS.map((algorithm) => (
                    <option key={algorithm.value} value={algorithm.value}>{algorithm.label}</option>
                  ))}
                </select>
              </div>

              <div className="lead-editor-control-grid">
                <label className="lead-editor-select-control">
                  <span>Carrier 1 Wave</span>
                  <select value={draft.params.carrier1Waveform ?? 'sine'} onChange={(event) => updateParam('carrier1Waveform', event.currentTarget.value as Lead4opFMWaveform)}>
                    {WAVEFORMS.map((waveform) => (
                      <option key={waveform} value={waveform}>{waveform}</option>
                    ))}
                  </select>
                </label>
                <label className="lead-editor-select-control">
                  <span>Carrier 2 Wave</span>
                  <select value={draft.params.carrier2Waveform ?? 'sine'} onChange={(event) => updateParam('carrier2Waveform', event.currentTarget.value as Lead4opFMWaveform)}>
                    {WAVEFORMS.map((waveform) => (
                      <option key={waveform} value={waveform}>{waveform}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="lead-editor-control-grid">
                <NumberControl label="Beat detune" value={draft.params.beatDetune} min={-50} max={50} step={1} unit="ct" onChange={(value) => updateParam('beatDetune', value)} />
                <NumberControl label="Carrier 2 mix" value={draft.params.carrier2Mix} min={0} max={1} step={0.01} onChange={(value) => updateParam('carrier2Mix', value)} />
                <NumberControl label="Stereo Spread" value={draft.params.stereoSpread ?? 0} min={0} max={1} step={0.01} onChange={(value) => updateParam('stereoSpread', value)} />
                <NumberControl label="Drive" value={draft.params.drive ?? 0} min={0} max={1} step={0.01} onChange={(value) => updateParam('drive', value)} />
                <NumberControl label="Unison voices" value={draft.params.unisonVoices ?? 1} min={1} max={4} step={1} onChange={(value) => updateParam('unisonVoices', Math.round(value))} />
                <NumberControl label="Unison detune" value={draft.params.unisonDetune ?? 0} min={0} max={50} step={1} unit="ct" onChange={(value) => updateParam('unisonDetune', value)} />
              </div>

              <div className="lead-editor-subsection">
                <div className="lead-editor-subsection-title">LFO</div>
                <div className="lead-editor-control-grid">
                  <NumberControl label="Rate" value={draft.params.lfo?.rate ?? 0} min={0} max={20} step={0.01} unit="Hz" onChange={(value) => updateLfo('rate', value)} />
                  <NumberControl label="Depth" value={draft.params.lfo?.depth ?? 0} min={0} max={1} step={0.01} onChange={(value) => updateLfo('depth', value)} />
                  <label className="lead-editor-select-control">
                    <span>Target</span>
                    <select value={draft.params.lfo?.target ?? 'all'} onChange={(event) => updateLfo('target', event.currentTarget.value as LfoTarget)}>
                      {LFO_TARGETS.map((target) => (
                        <option key={target} value={target}>{LFO_TARGET_LABELS[target]}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="lead-editor-subsection">
                <div className="lead-editor-section-head">
                  <span>Filter</span>
                  <select value={draft.params.filter.type ?? 'lowpass'} onChange={(event) => updateFilter('type', event.currentTarget.value as FilterType)}>
                    {FILTER_TYPES.map((filterType) => (
                      <option key={filterType} value={filterType}>{filterType}</option>
                    ))}
                  </select>
                </div>
                <div className="lead-editor-control-grid">
                  <NumberControl label="Frequency" value={draft.params.filter.freq} min={20} max={20000} step={10} unit="Hz" logarithmic onChange={(value) => updateFilter('freq', value)} />
                  <NumberControl label="Q" value={draft.params.filter.q} min={0.1} max={12} step={0.01} onChange={(value) => updateFilter('q', value)} />
                  <NumberControl label="Env attack" value={draft.params.filter.envAttack ?? 0} min={0} max={2} step={0.001} unit="s" onChange={(value) => updateFilter('envAttack', value)} />
                  <NumberControl label="Env decay" value={draft.params.filter.envDecay ?? 0} min={0} max={4} step={0.01} unit="s" onChange={(value) => updateFilter('envDecay', value)} />
                  <NumberControl label="Env sustain" value={draft.params.filter.envSustain ?? 1} min={0} max={1} step={0.01} onChange={(value) => updateFilter('envSustain', value)} />
                  <NumberControl label="Env release" value={draft.params.filter.envRelease ?? 0} min={0} max={4} step={0.01} unit="s" onChange={(value) => updateFilter('envRelease', value)} />
                  <NumberControl label="Env depth" value={draft.params.filter.envDepth ?? 0} min={-8000} max={8000} step={10} unit="Hz" onChange={(value) => updateFilter('envDepth', value)} />
                </div>
              </div>
            </div>
          )}

          {draft && activeTab === 'operators' && (
            <div className="lead-editor-section">
              <div className="lead-editor-matrix-wrap">
                <div className="lead-editor-operator-matrix" style={{ '--operator-columns': MAIN_OPERATOR_FIELDS.length } as CSSProperties}>
                  <div className="lead-editor-matrix-corner">Op</div>
                  {MAIN_OPERATOR_FIELDS.map((field) => (
                    <div key={field.key} className="lead-editor-matrix-head">{field.label}</div>
                  ))}
                  {OPERATOR_KEYS.map((operatorKey, index) => {
                    const operator = draft.params[operatorKey];
                    return (
                      <div className="lead-editor-matrix-row" key={operatorKey}>
                        <div className="lead-editor-operator-label">{index + 1}</div>
                        {MAIN_OPERATOR_FIELDS.map((field) => (
                          <NumberControl
                            key={field.key}
                            compact
                            label={field.label}
                            value={operator[field.key] ?? field.defaultValue}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            onChange={(value) => updateOperator(operatorKey, field.key, value)}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lead-editor-subsection">
                <div className="lead-editor-subsection-title">Operator timing</div>
                <div className="lead-editor-timing-grid">
                  {OPERATOR_KEYS.map((operatorKey, index) => (
                    <div className="lead-editor-timing-row" key={operatorKey}>
                      <span className="lead-editor-operator-label">Op {index + 1}</span>
                      {TIMING_OPERATOR_FIELDS.map((field) => (
                        <NumberControl
                          key={field.key}
                          compact
                          label={field.label}
                          value={draft.params[operatorKey][field.key] ?? field.defaultValue}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          onChange={(value) => updateOperator(operatorKey, field.key, value)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="lead-editor-subsection">
                <div className="lead-editor-subsection-title">Operator color and response</div>
                <div className="lead-editor-operator-v2-grid">
                  {OPERATOR_KEYS.map((operatorKey, index) => {
                    const operator = draft.params[operatorKey];
                    return (
                      <div className="lead-editor-operator-v2-row" key={operatorKey}>
                        <span className="lead-editor-operator-label">Op {index + 1}</span>
                        <label className="lead-editor-select-control compact">
                          <span>Wave</span>
                          <select value={operator.waveform ?? 'sine'} onChange={(event) => updateOperator(operatorKey, 'waveform', event.currentTarget.value as Lead4opFMWaveform)}>
                            {WAVEFORMS.map((waveform) => (
                              <option key={waveform} value={waveform}>{waveform}</option>
                            ))}
                          </select>
                        </label>
                        {V2_OPERATOR_FIELDS.map((field) => (
                          <NumberControl
                            key={field.key}
                            compact
                            label={field.label}
                            value={operator[field.key] ?? field.defaultValue}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            unit={field.unit}
                            onChange={(value) => updateOperator(operatorKey, field.key, value)}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>

        <footer className="lead-editor-footer">
          <div className="lead-editor-footer-meta">
            <span>{sourceLabel}</span>
            <span>{slotLabel}</span>
            <span>{presetId}</span>
          </div>
          <div className="lead-editor-footer-actions">
            <button
              className="lead-editor-plain-btn"
              type="button"
              onClick={() => void handleApply('copy')}
              disabled={!draft || loading || savingMode !== null}
            >
              Save copy
            </button>
            {canOverwrite && (
              <button
                className="lead-editor-plain-btn"
                type="button"
                onClick={() => void handleApply('overwrite')}
                disabled={!draft || loading || savingMode !== null}
              >
                {savingMode === 'overwrite' ? 'Overwriting' : overwriteLabel}
              </button>
            )}
            <button
              className="lead-editor-primary-btn"
              type="button"
              onClick={() => void handleApply('slot')}
              disabled={!draft || loading || savingMode !== null}
            >
              {savingMode === 'slot' ? 'Applying' : 'Apply to slot'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
