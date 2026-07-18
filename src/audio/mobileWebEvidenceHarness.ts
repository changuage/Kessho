import { coreProductEngineHost } from './coreProductEngineHost';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import {
  CoreProductMobileWebEvidenceCapture,
  type MobileWebEvidenceCaptureConfig,
  type MobileWebEvidenceExternalMeasurements,
} from './product/host/CoreProductMobileWebEvidenceCapture';

type EvidenceHost = {
  getProductTelemetry(): CoreProductTelemetrySnapshot | null;
  requestProductTelemetryOnce(): void;
  setMobileWebEvidenceTelemetryObserver(
    observer: ((telemetry: CoreProductTelemetrySnapshot) => void) | null,
  ): void;
};

type MobileWebEvidenceApi = {
  start(config: MobileWebEvidenceCaptureConfig): Promise<void>;
  finish(external: MobileWebEvidenceExternalMeasurements): Promise<Record<string, unknown>>;
  downloadLast(): void;
  getLast(): Record<string, unknown> | null;
  teardown(): void;
};

declare global {
  interface Window {
    __kesshoMobileWebEvidence?: MobileWebEvidenceApi;
  }
}

const host = coreProductEngineHost as unknown as EvidenceHost;
let capture: CoreProductMobileWebEvidenceCapture | null = null;
let latestTelemetry: CoreProductTelemetrySnapshot | null = null;
let lastEvidence: Record<string, unknown> | null = null;
let pendingTelemetry: ((telemetry: CoreProductTelemetrySnapshot) => void) | null = null;
let installed = false;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function documentHidden(): boolean {
  return document.visibilityState === 'hidden';
}

function handleTelemetry(telemetry: CoreProductTelemetrySnapshot): void {
  latestTelemetry = telemetry;
  capture?.observeTelemetry(telemetry, documentHidden());
  pendingTelemetry?.(telemetry);
  pendingTelemetry = null;
}

function handleVisibilityChange(): void {
  capture?.observeVisibility(documentHidden(), nowMs());
}

function requestFreshTelemetry(timeoutMs = 2_000): Promise<CoreProductTelemetrySnapshot> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      pendingTelemetry = null;
      reject(new Error('Timed out waiting for fresh Product Core telemetry'));
    }, timeoutMs);
    pendingTelemetry = (telemetry) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(telemetry);
    };
    host.requestProductTelemetryOnce();
  });
}

function downloadEvidence(evidence: Record<string, unknown>): void {
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `kessho-mobile-web-audio-evidence-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function installMobileWebEvidenceHarness(): void {
  if (installed) return;
  installed = true;
  latestTelemetry = host.getProductTelemetry();
  host.setMobileWebEvidenceTelemetryObserver(handleTelemetry);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  window.__kesshoMobileWebEvidence = {
    async start(config) {
      if (capture) throw new Error('A mobile web evidence capture is already active');
      if (documentHidden()) throw new Error('Mobile web evidence capture must start while visible');
      const telemetry = await requestFreshTelemetry().catch(() => latestTelemetry);
      if (!telemetry) throw new Error('Product Core telemetry is unavailable; start playback before evidence capture');
      capture = new CoreProductMobileWebEvidenceCapture(config, telemetry);
      lastEvidence = null;
    },
    async finish(external) {
      if (!capture) throw new Error('No mobile web evidence capture is active');
      if (documentHidden()) throw new Error('Mobile web evidence capture must finish after foreground restoration');
      if (!capture.isReadyToFinish()) {
        await requestFreshTelemetry();
      }
      const evidence = capture.finish(external);
      capture = null;
      lastEvidence = evidence;
      return evidence;
    },
    downloadLast() {
      if (!lastEvidence) throw new Error('No completed mobile web evidence capture is available');
      downloadEvidence(lastEvidence);
    },
    getLast() {
      return lastEvidence;
    },
    teardown() {
      capture = null;
      pendingTelemetry = null;
      host.setMobileWebEvidenceTelemetryObserver(null);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      delete window.__kesshoMobileWebEvidence;
      installed = false;
    },
  };
}
