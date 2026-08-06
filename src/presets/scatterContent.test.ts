import assert from 'node:assert/strict';
import { buildScatterConfigInstance, hydrateScatterConfigRefs, stripScatterConfigFromV2Metadata } from './scatterContent';

const metadata = {
  drumScatterState: {
    formatVersion: 1,
    active: true,
    selectedEngine: 'kick',
    simpleSpeed: 0.5,
    engines: { kick: { enabled: true, triggerProbability: 0.4, burstProbability: 0.2, feelX: 0, feelY: 0, rules: {} } },
  },
};

const instance = buildScatterConfigInstance(metadata as never);
assert.ok(instance);
const storedConfig = instance.content.config as Record<string, unknown>;
const storedEngines = storedConfig.engines as Record<string, unknown>;
assert.equal(storedEngines.kick !== undefined, true);
assert.equal(Object.keys(storedEngines).length, 7);
assert.equal('recentPhrasesByEngine' in storedConfig, false);

const payload = {
  schemaVersion: 1,
  contentType: 'scatterConfig',
  content: { config: metadata.drumScatterState },
};
const hydrated = hydrateScatterConfigRefs(undefined, [{
  version_id: 'version', ref_slot: 'scatter.config', content_hash: 'a'.repeat(64),
  content_type: 'scatterConfig', created_at: '',
}], new Map([['a'.repeat(64), payload]]));
assert.deepEqual(hydrated?.drumScatterState, storedConfig);
assert.equal(stripScatterConfigFromV2Metadata(metadata as never)?.drumScatterState, undefined);

console.log('scatter content regression passed');
