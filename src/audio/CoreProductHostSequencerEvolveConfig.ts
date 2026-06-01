import { CORE_PRODUCT_DICE_FLAGS, CORE_PRODUCT_EVOLVE_FLAGS } from './coreProductEvents';

export type NormalizedSequencerEvolveConfig = { enabled: boolean; evolution: number; everyBars: number; writeOffset: number | 'auto'; mutationMode: 'strict' | 'biased'; methods: Record<string, boolean>; enabledSubLanes?: string[] };

export type SequencerEvolveKind = 'synth' | 'drum';

const SYNTH_METHODS: Record<string, boolean> = { swingDrift: true, probDrift: false, ratchetSpray: false, pitchWalk: false, valueDrift: true, valueScramble: false, valueWiden: false, subLaneLengthDrift: false, subLaneDirectionFlip: false, triggerToggle: false };
const DRUM_METHODS: Record<string, boolean> = { rotateDrift: true, swingDrift: true, probDrift: false, ghostNotes: false, ratchetSpray: false, hitDrift: false, pitchWalk: false, valueDrift: true, valueScramble: false, valueWiden: false, subLaneLengthDrift: false, subLaneDirectionFlip: false };
const EVOLVE_METHOD_FLAGS: ReadonlyArray<readonly [string, number]> = [['rotateDrift', CORE_PRODUCT_EVOLVE_FLAGS.rotateDrift], ['swingDrift', CORE_PRODUCT_EVOLVE_FLAGS.swingDrift], ['probDrift', CORE_PRODUCT_EVOLVE_FLAGS.probDrift], ['ghostNotes', CORE_PRODUCT_EVOLVE_FLAGS.ghostNotes], ['ratchetSpray', CORE_PRODUCT_EVOLVE_FLAGS.ratchetSpray], ['hitDrift', CORE_PRODUCT_EVOLVE_FLAGS.hitDrift], ['pitchWalk', CORE_PRODUCT_EVOLVE_FLAGS.pitchWalk], ['valueDrift', CORE_PRODUCT_EVOLVE_FLAGS.valueDrift], ['valueScramble', CORE_PRODUCT_EVOLVE_FLAGS.valueScramble], ['valueWiden', CORE_PRODUCT_EVOLVE_FLAGS.valueWiden], ['subLaneLengthDrift', CORE_PRODUCT_EVOLVE_FLAGS.subLaneLengthDrift], ['subLaneDirectionFlip', CORE_PRODUCT_EVOLVE_FLAGS.subLaneDirectionFlip], ['triggerToggle', CORE_PRODUCT_EVOLVE_FLAGS.triggerToggle]];

function defaultEvolveMethods(kind?: SequencerEvolveKind): Record<string, boolean> {
  return kind === 'synth' ? { ...SYNTH_METHODS } : kind === 'drum' ? { ...DRUM_METHODS } : {};
}

function allowsSubLane(config: NormalizedSequencerEvolveConfig, lane: string): boolean {
  return !config.enabledSubLanes || config.enabledSubLanes.includes(lane);
}

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

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

export function evolveMethodFlagsForEvolveConfig(config: NormalizedSequencerEvolveConfig): number {
  let flags = 0;
  for (const [method, flag] of EVOLVE_METHOD_FLAGS) if (config.methods?.[method]) flags |= flag;
  if (config.mutationMode === 'strict') flags |= CORE_PRODUCT_EVOLVE_FLAGS.mutationStrict;
  return flags;
}

export function normalizeEvolveConfigs(configs: unknown, kind?: SequencerEvolveKind): NormalizedSequencerEvolveConfig[] {
  const items = Array.isArray(configs) ? configs : [];
  return items.slice(0, 4).map((config) => {
    const source = config && typeof config === 'object' ? config as Record<string, unknown> : {};
    const evolution = finiteNumber(source.evolution, 0.25);
    const everyBars = finiteNumber(source.everyBars, 4);
    const writeOffset = source.writeOffset === 'auto'
      ? 'auto'
      : Math.max(0, Math.round(finiteNumber(source.writeOffset, 0)));
    const methodsSource = recordValue(source.methods);
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
