import assert from 'node:assert/strict';

import {
  incrementPresetPlays,
  parseCloudCreatedCursor,
  parseCloudPlaysCursor,
  saveCloudPreset,
  type CloudPresetInsert,
} from './supabase';
import {
  hashCanonicalJsonText,
  readVerifiedPresetPayloadCacheV2,
  stableStringifyCanonical,
  writePresetPayloadCacheV2,
} from '../presets/presetStorageV2';
import { DEFAULT_STATE } from '../ui/state';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PRESET_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PRESET_ID = '44444444-4444-4444-8444-444444444444';

function encodeCursor(payload: unknown): string {
  return globalThis.btoa(JSON.stringify(payload));
}

const createdCursor = parseCloudCreatedCursor(encodeCursor({
  id: PRESET_ID,
  created_at: '2026-06-27T21:00:00.000Z',
}));
assert.deepEqual(createdCursor, {
  id: PRESET_ID,
  created_at: '2026-06-27T21:00:00.000Z',
});
assert.equal(parseCloudCreatedCursor('not-base64'), null);
assert.equal(parseCloudCreatedCursor(globalThis.btoa('{nope')), null);
assert.equal(parseCloudCreatedCursor(encodeCursor({ id: 'not-a-uuid', created_at: '2026-06-27T21:00:00.000Z' })), null);
assert.equal(parseCloudCreatedCursor(encodeCursor({ id: PRESET_ID, created_at: '2026-06-27T21:00:00.000Z),id.gt.x' })), null);
assert.deepEqual(parseCloudPlaysCursor(encodeCursor({ id: PRESET_ID, plays: 4.8 })), { id: PRESET_ID, plays: 4 });
assert.deepEqual(parseCloudPlaysCursor(encodeCursor({ id: PRESET_ID, plays: -2 })), { id: PRESET_ID, plays: 0 });

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function installStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
  return storage;
}

function makeClient(options: {
  userId?: string;
  lookupId?: string | null;
  card?: Record<string, unknown> | null;
  saveId?: string;
  incrementError?: unknown;
} = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const userId = options.userId ?? USER_A;
  return {
    calls,
    client: {
      auth: {
        getSession: async () => ({
          data: {
            session: userId
              ? { user: { id: userId, is_anonymous: true } }
              : null,
          },
        }),
        signInAnonymously: async () => ({
          data: { user: userId ? { id: userId, is_anonymous: true } : null },
          error: null,
        }),
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === 'increment_plays') {
          return options.incrementError ? { data: null, error: options.incrementError } : { data: true, error: null };
        }
        if (fn === 'kessho_lookup_preset_id_v2') {
          return { data: options.lookupId ?? null, error: null };
        }
        if (fn === 'kessho_get_preset_card_v2') {
          return { data: options.card ?? null, error: null };
        }
        if (fn === 'kessho_save_preset_v2') {
          return {
            data: {
              preset: {
                id: options.saveId ?? String((args.identity_payload as { id?: unknown }).id ?? PRESET_ID),
                created_at: '2026-06-27T21:00:00.000Z',
              },
            },
            error: null,
          };
        }
        throw new Error(`unexpected rpc ${fn}`);
      },
    },
  };
}

const playStorage = installStorage();
let fake = makeClient();
assert.equal(await incrementPresetPlays(PRESET_ID, fake.client as never), true);
assert.equal(fake.calls.filter((call) => call.fn === 'increment_plays').length, 1);
assert.equal(playStorage.length, 1, 'first successful play should write a session marker');
assert.equal(await incrementPresetPlays(PRESET_ID, fake.client as never), false);
assert.equal(fake.calls.filter((call) => call.fn === 'increment_plays').length, 1, 'fresh marker should skip RPC');

playStorage.clear();
fake = makeClient({ incrementError: { message: 'offline' } });
const originalWarn = console.warn;
console.warn = () => undefined;
assert.equal(await incrementPresetPlays(PRESET_ID, fake.client as never), false);
console.warn = originalWarn;
assert.equal(playStorage.length, 0, 'failed RPC must not write a session marker');
assert.equal(await incrementPresetPlays('not-a-uuid', fake.client as never), false);
assert.equal(playStorage.length, 0, 'invalid preset id must not write a session marker');

playStorage.clear();
fake = makeClient();
assert.equal(await incrementPresetPlays(PRESET_ID, fake.client as never), true);
playStorage.clear();
assert.equal(await incrementPresetPlays(PRESET_ID, fake.client as never), true, 'clearing the session allows a future increment');

const preset: CloudPresetInsert = {
  name: 'Shared Name',
  author: 'Tester',
  description: '',
  data: DEFAULT_STATE,
};

fake = makeClient({
  userId: USER_A,
  lookupId: PRESET_ID,
  card: {
    id: PRESET_ID,
    owner_key: `public:${USER_A}`,
    owner_user_id: USER_A,
    latest_version_no: 3,
  },
});
await saveCloudPreset(preset, fake.client as never);
let saveCall = fake.calls.find((call) => call.fn === 'kessho_save_preset_v2');
assert.ok(saveCall);
assert.equal((saveCall.args.identity_payload as { id?: unknown }).id, PRESET_ID);
assert.equal((saveCall.args.identity_payload as { owner_key?: unknown }).owner_key, `public:${USER_A}`);

fake = makeClient({
  userId: USER_A,
  lookupId: OTHER_PRESET_ID,
  card: {
    id: OTHER_PRESET_ID,
    owner_key: `public:${USER_B}`,
    owner_user_id: USER_B,
    latest_version_no: 9,
  },
  saveId: PRESET_ID,
});
await saveCloudPreset(preset, fake.client as never);
saveCall = fake.calls.find((call) => call.fn === 'kessho_save_preset_v2');
assert.ok(saveCall);
assert.equal((saveCall.args.identity_payload as { id?: unknown }).id, null, 'other user same name must create a separate logical preset');
assert.equal(fake.calls.some((call) => call.fn === 'kessho_save_legacy_preset'), false, 'legacy save path must not be used');

fake = makeClient({ userId: '' });
await assert.rejects(() => saveCloudPreset(preset, fake.client as never), /Anonymous cloud session required/);

installStorage();
const cachedPayload = { b: 2, a: 1 };
const cachedHash = await hashCanonicalJsonText(stableStringifyCanonical(cachedPayload));
await writePresetPayloadCacheV2(cachedHash, cachedPayload);
assert.deepEqual(await readVerifiedPresetPayloadCacheV2(cachedHash), cachedPayload);
assert.deepEqual(await readVerifiedPresetPayloadCacheV2(cachedHash), cachedPayload, 'second verified cache read should hit memory');

const badHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
localStorage.setItem(`kessho:presetPayload:v2:${badHash}`, JSON.stringify({
  version: 1,
  hash: badHash,
  payload: cachedPayload,
  bytes: 20,
  createdAt: Date.now(),
  lastAccess: Date.now(),
}));
assert.equal(await readVerifiedPresetPayloadCacheV2(badHash), undefined);
assert.equal(localStorage.getItem(`kessho:presetPayload:v2:${badHash}`), null);

const badJsonHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
localStorage.setItem(`kessho:presetPayload:v2:${badJsonHash}`, '{bad');
assert.equal(await readVerifiedPresetPayloadCacheV2(badJsonHash), undefined);
assert.equal(localStorage.getItem(`kessho:presetPayload:v2:${badJsonHash}`), null);
