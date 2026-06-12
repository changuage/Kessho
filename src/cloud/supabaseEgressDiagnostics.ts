const DEBUG_STORAGE_KEY = 'kessho:supabaseEgressDebug';
const WARNING_THRESHOLD_BYTES = 256 * 1024;
const LIST_REFRESH_PAUSE_THRESHOLD_BYTES = 1024 * 1024;
const QUOTA_RESPONSE_WINDOW_MS = 30_000;
const QUOTA_RESPONSE_THRESHOLD = 2;
const QUOTA_CIRCUIT_MS = 120_000;
const ERROR_BODY_INSPECTION_MAX_BYTES = 64 * 1024;

type SupabaseEgressService = 'rest' | 'auth' | 'storage' | 'functions' | 'realtime' | 'other';

type SupabaseEgressTripwireState = {
  totalBytes: number;
  serviceBytes: Record<SupabaseEgressService, number>;
  warningLogged: boolean;
  listRefreshPaused: boolean;
  quotaResponseTimes: number[];
  quotaCircuitOpenUntil: number;
};

const tripwireState: SupabaseEgressTripwireState = {
  totalBytes: 0,
  serviceBytes: {
    rest: 0,
    auth: 0,
    storage: 0,
    functions: 0,
    realtime: 0,
    other: 0,
  },
  warningLogged: false,
  listRefreshPaused: false,
  quotaResponseTimes: [],
  quotaCircuitOpenUntil: 0,
};

function isDiagnosticsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
}

function getRequestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return init?.method ?? (input instanceof Request ? input.method : 'GET');
}

function classifySupabaseService(url: string): SupabaseEgressService | null {
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }

  if (path.includes('/rest/v1/')) return 'rest';
  if (path.includes('/auth/v1/')) return 'auth';
  if (path.includes('/storage/v1/')) return 'storage';
  if (path.includes('/functions/v1/')) return 'functions';
  if (path.includes('/realtime/v1/')) return 'realtime';
  return url.includes('supabase.co') ? 'other' : null;
}

function formatMib(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

function looksLikeQuotaResponse(status: number, bodyText: string | null): boolean {
  if (status === 402 || status === 429) return true;
  if (!bodyText) return false;
  const lower = bodyText.toLowerCase();
  return lower.includes('payment required') || lower.includes('quota') || lower.includes('egress');
}

function recordQuotaResponse(now: number, url: string, status: number): void {
  tripwireState.quotaResponseTimes = [
    ...tripwireState.quotaResponseTimes.filter(time => now - time <= QUOTA_RESPONSE_WINDOW_MS),
    now,
  ];

  if (tripwireState.quotaResponseTimes.length < QUOTA_RESPONSE_THRESHOLD) return;

  const nextOpenUntil = now + QUOTA_CIRCUIT_MS;
  const wasOpen = tripwireState.quotaCircuitOpenUntil > now;
  tripwireState.quotaCircuitOpenUntil = Math.max(tripwireState.quotaCircuitOpenUntil, nextOpenUntil);
  if (!wasOpen) {
    console.warn('[supabase-egress] Quota responses detected; cloud reads are temporarily paused for this tab.', {
      status,
      url,
      pauseMs: QUOTA_CIRCUIT_MS,
    });
  }
}

function recordSupabaseEgress(
  service: SupabaseEgressService,
  bytes: number,
  url: string,
  status: number,
  bodyText: string | null,
): void {
  if (looksLikeQuotaResponse(status, bodyText)) {
    recordQuotaResponse(Date.now(), url, status);
  }

  if (!Number.isFinite(bytes) || bytes <= 0) return;

  tripwireState.totalBytes += bytes;
  tripwireState.serviceBytes[service] += bytes;

  if (!tripwireState.warningLogged && tripwireState.totalBytes >= WARNING_THRESHOLD_BYTES) {
    tripwireState.warningLogged = true;
    console.warn('[supabase-egress] This tab has received more than 256 KB from Supabase.', {
      sessionMb: formatMib(tripwireState.totalBytes),
      restMb: formatMib(tripwireState.serviceBytes.rest),
    });
  }

  if (!tripwireState.listRefreshPaused && tripwireState.totalBytes >= LIST_REFRESH_PAUSE_THRESHOLD_BYTES) {
    tripwireState.listRefreshPaused = true;
    console.warn('[supabase-egress] Supabase list refreshes are paused for this tab after 1 MB of received data. Explicit loads still work.', {
      sessionMb: formatMib(tripwireState.totalBytes),
      restMb: formatMib(tripwireState.serviceBytes.rest),
    });
  }

}

function decodeBodyForInspection(buffer: ArrayBuffer, status: number): string | null {
  if (status < 400 && buffer.byteLength > 64 * 1024) return null;
  try {
    return new TextDecoder().decode(buffer);
  } catch {
    return null;
  }
}

function getContentLengthBytes(response: Response): number {
  const raw = response.headers.get('content-length');
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function measureResponseBody(
  response: Response,
  exactBodyMeasurement: boolean,
): Promise<{ bytes: number; text: string | null }> {
  const contentLengthBytes = getContentLengthBytes(response);
  const shouldInspectErrorBody = response.status >= 400
    && response.status !== 402
    && response.status !== 429
    && contentLengthBytes <= ERROR_BODY_INSPECTION_MAX_BYTES;

  if (!exactBodyMeasurement && !shouldInspectErrorBody) {
    return { bytes: contentLengthBytes, text: null };
  }

  try {
    const buffer = await response.clone().arrayBuffer();
    return {
      bytes: buffer.byteLength || contentLengthBytes,
      text: decodeBodyForInspection(buffer, response.status),
    };
  } catch {
    return { bytes: contentLengthBytes, text: null };
  }
}

export function isSupabaseEgressListRefreshPaused(): boolean {
  return tripwireState.listRefreshPaused;
}

export function isSupabaseEgressQuotaCircuitOpen(now = Date.now()): boolean {
  return tripwireState.quotaCircuitOpenUntil > now;
}

export function getSupabaseEgressTripwireSnapshot() {
  return {
    totalBytes: tripwireState.totalBytes,
    totalMb: Number(formatMib(tripwireState.totalBytes)),
    serviceBytes: { ...tripwireState.serviceBytes },
    listRefreshPaused: tripwireState.listRefreshPaused,
    quotaCircuitOpenUntil: tripwireState.quotaCircuitOpenUntil,
  };
}

export async function supabaseEgressDiagnosticFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  const url = getRequestUrl(input);
  const service = classifySupabaseService(url);
  if (!service) return response;

  const diagnosticsEnabled = isDiagnosticsEnabled();
  const { bytes: bodyBytes, text: bodyText } = await measureResponseBody(response, diagnosticsEnabled);
  recordSupabaseEgress(service, bodyBytes, url, response.status, bodyText);

  if (diagnosticsEnabled) {
    console.info('[supabase-egress]', {
      method: getRequestMethod(input, init),
      service,
      url,
      status: response.status,
      bodyBytes,
      sessionBytes: tripwireState.totalBytes,
    });
  }

  return response;
}

declare global {
  interface Window {
    __kesshoSupabaseEgress?: typeof getSupabaseEgressTripwireSnapshot;
  }
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__kesshoSupabaseEgress = getSupabaseEgressTripwireSnapshot;
}
