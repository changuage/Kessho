const CONTENT_FLOAT_PRECISION = 1_000_000;
const CONTENT_TEXT_ENCODER = new TextEncoder();
const HEX_BYTE_LOOKUP = Array.from(
  { length: 256 },
  (_, byte) => byte.toString(16).padStart(2, '0'),
);

function roundContentNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value * CONTENT_FLOAT_PRECISION) / CONTENT_FLOAT_PRECISION;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareCanonicalKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalizeContentJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return roundContentNumber(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => canonicalizeContentJson(item));
  if (isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareCanonicalKeys)) {
      const entryValue = value[key];
      if (entryValue === undefined) continue;
      normalized[key] = canonicalizeContentJson(entryValue);
    }
    return normalized;
  }
  return value;
}

export function canonicalizeContentRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return canonicalizeContentJson(record) as Record<string, unknown>;
}

export function stableStringifyContent(value: unknown): string {
  return JSON.stringify(canonicalizeContentJson(value));
}

export function contentUtf8ByteLength(value: string): number {
  return CONTENT_TEXT_ENCODER.encode(value).byteLength;
}

export async function hashCanonicalContentText(canonicalJson: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto is unavailable; cannot hash preset payloads.');
  const digest = await subtle.digest('SHA-256', CONTENT_TEXT_ENCODER.encode(canonicalJson));
  const digestBytes = new Uint8Array(digest);
  let hex = '';
  for (let index = 0; index < digestBytes.length; index += 1) {
    const byte = digestBytes[index];
    if (byte !== undefined) hex += HEX_BYTE_LOOKUP[byte] ?? '';
  }
  return hex;
}

export async function hashCanonicalContent(value: unknown): Promise<string> {
  return hashCanonicalContentText(stableStringifyContent(value));
}
