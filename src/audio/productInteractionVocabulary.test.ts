import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PRODUCT_INTERACTION_CHILD,
  PRODUCT_INTERACTION_COMMAND,
  PRODUCT_INTERACTION_DEMAND,
  PRODUCT_INTERACTION_EVENT,
  PRODUCT_INTERACTION_ORIGIN,
  PRODUCT_INTERACTION_PARENT,
  PRODUCT_INTERACTION_SIGNAL,
  PRODUCT_INTERACTION_TAP,
  PRODUCT_INTERACTION_VERSION,
} from './productInteractionVocabulary';

const header = readFileSync('cpp/KesshoCore/include/KesshoCore/KesshoProductInteraction.h', 'utf8');

function enumValue(name: string): number {
  const match = header.match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`));
  assert.ok(match, `missing ${name}`);
  return Number(match[1]);
}

function assertMap(prefix: string, values: Record<string, number>): void {
  for (const [key, value] of Object.entries(values)) {
    const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
    assert.equal(enumValue(`${prefix}_${snake}`), value, key);
  }
}

test('TypeScript and Product Core share exact interaction vocabulary IDs', () => {
  assert.match(header, new RegExp(`KESSHO_PRODUCT_INTERACTION_VERSION\\s+${PRODUCT_INTERACTION_VERSION}u`));
  assertMap('KESSHO_PRODUCT_INTERACTION_PARENT', PRODUCT_INTERACTION_PARENT);
  assertMap('KESSHO_PRODUCT_INTERACTION_CHILD', PRODUCT_INTERACTION_CHILD);
  assertMap('KESSHO_PRODUCT_INTERACTION_TAP', PRODUCT_INTERACTION_TAP);
  assertMap('KESSHO_PRODUCT_INTERACTION_ORIGIN', PRODUCT_INTERACTION_ORIGIN);
  assertMap('KESSHO_PRODUCT_INTERACTION_EVENT', PRODUCT_INTERACTION_EVENT);
  assertMap('KESSHO_PRODUCT_INTERACTION_SIGNAL', PRODUCT_INTERACTION_SIGNAL);
  assertMap('KESSHO_PRODUCT_INTERACTION_COMMAND', PRODUCT_INTERACTION_COMMAND);
});

test('demand bits and source identity alignment remain fixed', () => {
  for (const [key, value] of Object.entries(PRODUCT_INTERACTION_DEMAND)) {
    const name = `KESSHO_PRODUCT_INTERACTION_DEMAND_${key.toUpperCase()}`;
    if (key === 'all') {
      assert.match(header, new RegExp(`${name}\\s*=\\s*\\(1u << 7u\\) - 1u`));
      assert.equal(value, (1 << 7) - 1);
      continue;
    }
    const match = header.match(new RegExp(`${name}\\s*=\\s*1u << (\\d+)u`));
    assert.ok(match, `missing ${name}`);
    assert.equal(1 << Number(match[1]), value);
    assert.equal(value & ~PRODUCT_INTERACTION_DEMAND.all, 0);
  }
  assert.deepEqual(
    Object.values(PRODUCT_INTERACTION_CHILD).slice(1, 9),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal('analysisFrequencyBands' in PRODUCT_INTERACTION_SIGNAL, false);
  assert.doesNotMatch(header, /FREQUENCY_BAND/);
});
