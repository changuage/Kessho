import assert from 'node:assert/strict';
import {
  createDefaultSeqScatterState,
  deserializeSeqScatterState,
  serializeSeqScatterState,
} from './scatterDefaults';

const authored = createDefaultSeqScatterState();
authored.active = true;
authored.selectedEngine = 'noise';
authored.simpleSpeed = 0.73;
authored.engines.kick.triggerProbability = 0.91;
authored.engines.kick.burstProbability = 0.62;
authored.engines.kick.randomWalkEnabled = true;
authored.engines.kick.rules.motion = 0.84;
authored.recentPhrasesByEngine.kick = [{
  id: 'transient-generated-phrase',
} as never];

const serialized = serializeSeqScatterState(authored);
assert.equal(serialized.formatVersion, 1);
assert.equal(serialized.simpleSpeed, 0.73);
assert.equal(serialized.engines.kick.triggerProbability, 0.91);
assert.equal('recentPhrasesByEngine' in serialized, false, 'generated phrase history must not enter preset storage');

const restored = deserializeSeqScatterState(serialized);
assert.equal(restored.active, true);
assert.equal(restored.selectedEngine, 'noise');
assert.equal(restored.simpleSpeed, 0.73);
assert.equal(restored.engines.kick.burstProbability, 0.62);
assert.equal(restored.engines.kick.randomWalkEnabled, true);
assert.equal(restored.engines.kick.rules.motion, 0.84);
assert.deepEqual(restored.recentPhrasesByEngine.kick, []);

const malformed = {
  ...serialized,
  simpleSpeed: Number.POSITIVE_INFINITY,
  engines: {
    ...serialized.engines,
    kick: {
      ...serialized.engines.kick,
      triggerProbability: 5,
      feelX: -5,
      rules: {
        ...serialized.engines.kick.rules,
        spread: Number.NaN,
      },
    },
  },
};
const sanitized = deserializeSeqScatterState(malformed);
assert.equal(sanitized.simpleSpeed, 0.25);
assert.equal(sanitized.engines.kick.triggerProbability, 1);
assert.equal(sanitized.engines.kick.feelX, -1);
assert.equal(sanitized.engines.kick.rules.spread, 0.1);

