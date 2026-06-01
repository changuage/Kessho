import { CORE_PRODUCT_DICE_FLAGS, CORE_PRODUCT_EVOLVE_FLAGS } from '../../coreProductEvents';
import type { NormalizedSequencerEvolveConfig, SequencerEvolveKind } from '../../CoreProductHostSequencerEvolveConfig';

function allowsSubLane(config: NormalizedSequencerEvolveConfig, lane: string): boolean {
  return !config.enabledSubLanes || config.enabledSubLanes.includes(lane);
}

function fieldFlagForSubLane(lane: string): number {
  switch (lane) {
    case 'probability': return CORE_PRODUCT_DICE_FLAGS.probability;
    case 'ratchet': return CORE_PRODUCT_DICE_FLAGS.ratchet;
    case 'pitch': return CORE_PRODUCT_DICE_FLAGS.midiNote;
    case 'expression': return CORE_PRODUCT_DICE_FLAGS.expression;
    case 'morph': return CORE_PRODUCT_DICE_FLAGS.morph;
    case 'distance': return CORE_PRODUCT_DICE_FLAGS.distance;
    default: return 0;
  }
}

function fieldFlagsForSubLanes(config: NormalizedSequencerEvolveConfig, lanes: readonly string[]): number {
  let flags = 0;
  for (const lane of lanes) if (allowsSubLane(config, lane)) flags |= fieldFlagForSubLane(lane);
  return flags;
}

export function nativeEvolveFlagsForEvolveConfig(config: NormalizedSequencerEvolveConfig, kind: SequencerEvolveKind): number {
  const methods = config.methods ?? {};
  let methodFlags = 0;
  let fieldFlags = 0;
  const valueFields = fieldFlagsForSubLanes(config, ['expression', 'morph', 'distance']);
  const lengthFields = fieldFlagsForSubLanes(config, ['pitch', 'expression', 'morph', 'distance']);
  if (kind === 'drum' && methods.rotateDrift) methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.rotateDrift;
  if (methods.swingDrift) methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.swingDrift;
  if (methods.probDrift && allowsSubLane(config, 'probability')) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.probDrift; fieldFlags |= CORE_PRODUCT_DICE_FLAGS.probability; }
  if (kind === 'drum' && methods.ghostNotes && allowsSubLane(config, 'expression') && allowsSubLane(config, 'distance')) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.ghostNotes; fieldFlags |= CORE_PRODUCT_DICE_FLAGS.trigger | CORE_PRODUCT_DICE_FLAGS.expression | CORE_PRODUCT_DICE_FLAGS.distance; }
  if (methods.ratchetSpray && allowsSubLane(config, 'ratchet')) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.ratchetSpray; fieldFlags |= CORE_PRODUCT_DICE_FLAGS.ratchet; }
  if (kind === 'drum' && methods.hitDrift) methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.hitDrift;
  if (methods.pitchWalk && allowsSubLane(config, 'pitch')) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.pitchWalk; fieldFlags |= CORE_PRODUCT_DICE_FLAGS.midiNote; }
  if (valueFields && methods.valueDrift) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.valueDrift; fieldFlags |= valueFields; }
  if (valueFields && methods.valueScramble) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.valueScramble; fieldFlags |= valueFields; }
  if (valueFields && methods.valueWiden) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.valueWiden; fieldFlags |= valueFields; }
  if (lengthFields && methods.subLaneLengthDrift) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.subLaneLengthDrift; fieldFlags |= lengthFields; }
  if (lengthFields && methods.subLaneDirectionFlip) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.subLaneDirectionFlip; fieldFlags |= lengthFields; }
  if (kind === 'synth' && methods.triggerToggle) { methodFlags |= CORE_PRODUCT_EVOLVE_FLAGS.triggerToggle; fieldFlags |= CORE_PRODUCT_DICE_FLAGS.trigger; }
  if (methodFlags === 0) return 0;
  return fieldFlags | methodFlags | (config.mutationMode === 'strict' ? CORE_PRODUCT_EVOLVE_FLAGS.mutationStrict : 0);
}
