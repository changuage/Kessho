import { CORE_PRODUCT_DICE_FLAGS } from './coreProductEvents';

export type NormalizedSequencerEvolveConfig = {
  enabled: boolean;
  evolution: number;
  everyBars: number;
  writeOffset: number | 'auto';
  mutationMode: 'strict' | 'biased';
  methods: Record<string, boolean>;
  enabledSubLanes?: string[];
};

export type SequencerEvolveKind = 'synth' | 'drum';

const SYNTH_METHODS: Record<string, boolean> = { swingDrift: true, probDrift: false, ratchetSpray: false, pitchWalk: false, valueDrift: true, valueScramble: false, valueWiden: false, subLaneLengthDrift: false, subLaneDirectionFlip: false, triggerToggle: false };
const DRUM_METHODS: Record<string, boolean> = { rotateDrift: true, swingDrift: true, probDrift: false, ghostNotes: false, ratchetSpray: false, hitDrift: false, pitchWalk: false, valueDrift: true, valueScramble: false, valueWiden: false, subLaneLengthDrift: false, subLaneDirectionFlip: false };

function defaultEvolveMethods(kind?: SequencerEvolveKind): Record<string, boolean> {
  return kind === 'synth' ? { ...SYNTH_METHODS } : kind === 'drum' ? { ...DRUM_METHODS } : {};
}

function allowsSubLane(config: NormalizedSequencerEvolveConfig, lane: string): boolean {
  return !config.enabledSubLanes || config.enabledSubLanes.includes(lane);
}

export function diceFlagsForEvolveConfig(config: NormalizedSequencerEvolveConfig): number {
  const methods = config.methods ?? {};
  let flags = 0;
  const ghostNotesEnabled = methods.ghostNotes && allowsSubLane(config, 'expression') && allowsSubLane(config, 'distance');
  if (methods.rotateDrift || methods.hitDrift || ghostNotesEnabled || methods.triggerToggle) flags |= CORE_PRODUCT_DICE_FLAGS.trigger;
  if (methods.probDrift && allowsSubLane(config, 'probability')) flags |= CORE_PRODUCT_DICE_FLAGS.probability;
  if (methods.ratchetSpray && allowsSubLane(config, 'ratchet')) flags |= CORE_PRODUCT_DICE_FLAGS.ratchet;
  if (methods.pitchWalk && allowsSubLane(config, 'pitch')) flags |= CORE_PRODUCT_DICE_FLAGS.midiNote;
  if ((methods.valueDrift || methods.valueScramble || methods.valueWiden) && allowsSubLane(config, 'expression')) flags |= CORE_PRODUCT_DICE_FLAGS.expression;
  if ((methods.valueDrift || methods.valueScramble || methods.valueWiden) && allowsSubLane(config, 'morph')) flags |= CORE_PRODUCT_DICE_FLAGS.morph;
  if ((methods.valueDrift || methods.valueScramble || methods.valueWiden) && allowsSubLane(config, 'distance')) flags |= CORE_PRODUCT_DICE_FLAGS.distance;
  return flags;
}

export function normalizeEvolveConfigs(configs: unknown, kind?: SequencerEvolveKind): NormalizedSequencerEvolveConfig[] {
  const items = Array.isArray(configs) ? configs : [];
  return items.slice(0, 4).map((config) => {
    const source = config && typeof config === 'object' ? config as Record<string, unknown> : {};
    const evolution = typeof source.evolution === 'number' && Number.isFinite(source.evolution)
      ? source.evolution
      : 0.25;
    const everyBars = typeof source.everyBars === 'number' && Number.isFinite(source.everyBars)
      ? source.everyBars
      : 4;
    const writeOffset = source.writeOffset === 'auto'
      ? 'auto'
      : typeof source.writeOffset === 'number' && Number.isFinite(source.writeOffset)
        ? Math.max(0, Math.round(source.writeOffset))
        : 0;
    const methodsSource = source.methods && typeof source.methods === 'object' && !Array.isArray(source.methods)
      ? source.methods as Record<string, unknown>
      : {};
    const methods: Record<string, boolean> = defaultEvolveMethods(kind);
    for (const [key, value] of Object.entries(methodsSource)) {
      methods[key] = value === true;
    }
    const enabledSubLanes = Array.isArray(source.enabledSubLanes)
      ? source.enabledSubLanes.filter((lane): lane is string => typeof lane === 'string')
      : undefined;
    return {
      enabled: source.enabled === true,
      evolution: Math.max(0, Math.min(1, evolution)),
      everyBars: Math.max(1, Math.round(everyBars)),
      writeOffset,
      mutationMode: source.mutationMode === 'strict' ? 'strict' : 'biased',
      methods,
      ...(enabledSubLanes ? { enabledSubLanes } : {}),
    };
  });
}
