import assert from 'node:assert/strict';
import { SupabasePresetStore } from './SupabasePresetStore';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
  },
});

const realNow = Date.now;
let now = realNow();
Date.now = () => now;
let mode: 'quota' | 'online' | 'offline' | 'empty' = 'quota';
let requests = 0;
const offlineError = { message: 'TypeError: Failed to fetch', code: '' };
const row = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'state',
  scope: 'global',
  name: 'Recovered L4',
  author: 'user',
  library: 'cloud',
  visibility: 'public',
  latest_version_no: 1,
  created_at: '2026-10-07T00:00:00Z',
  updated_at: '2026-10-07T00:00:00Z',
  deleted_at: null,
};
const client = {
  from(table: string) {
    assert.equal(table, 'preset_summaries_v2');
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      order: () => query,
      limit: async () => {
        requests += 1;
        if (mode === 'quota') return { data: null, error: { message: '402 Payment Required' } };
        if (mode === 'offline') return { data: null, error: offlineError };
        return { data: mode === 'empty' ? [] : [row], error: null };
      },
    };
    return query;
  },
};

try {
  const store = new SupabasePresetStore(client as never);
  assert.deepEqual(await store.list('state', 'global'), []);
  assert.equal(requests, 1, 'quota failure in the schema probe must skip the list query');
  assert.equal(values.size, 0, 'a skipped list query must not cache an empty library');

  now += 120_001;
  mode = 'online';
  assert.equal((await store.list('state', 'global'))[0]?.name, row.name);
  const cachedSession = [...values.entries()];
  const requestsAfterRecovery = requests;
  await store.list('state', 'global');
  assert.equal(requests, requestsAfterRecovery, 'successful results still use the cache');

  now += 46 * 60_000;
  mode = 'offline';
  assert.equal((await store.list('state', 'global'))[0]?.name, row.name,
    'a failed refresh must preserve the last successful memory list');
  // The expired session entry is removed, never replaced by a failed empty read.
  assert.equal(values.size, 0);
  assert.ok(cachedSession.length > 0);

  const freshStore = new SupabasePresetStore(client as never);
  await assert.rejects(() => freshStore.list('state', 'global'), error => error === offlineError);
  assert.equal(values.size, 0, 'Failed to fetch must not create an empty session cache');
  mode = 'online';
  assert.equal((await freshStore.list('state', 'global'))[0]?.name, row.name,
    'a fresh read must recover immediately once connectivity returns');

  mode = 'empty';
  const beforeEmpty = requests;
  assert.deepEqual(await freshStore.list('engine', 'lead4opfm'), []);
  assert.equal(requests, beforeEmpty + 1);
  await freshStore.list('engine', 'lead4opfm');
  assert.equal(requests, beforeEmpty + 1, 'a genuinely empty successful result should be cached');
  console.log('Cloud preset list recovery regression passed');
} finally {
  Date.now = realNow;
  delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
}
