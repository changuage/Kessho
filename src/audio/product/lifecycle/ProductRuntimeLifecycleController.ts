import type { ProductEngineLifecycleState } from '../ProductEngineTypes';
import {
  PRODUCT_RUNTIME_ALLOWED_INTENTS,
  type ProductRuntimeLifecycleIntent,
  type ProductRuntimeLifecycleState,
} from './ProductRuntimeLifecycleState';

export type ProductLifecycleOperation =
  ProductRuntimeLifecycleIntent;

export type ProductLifecycleStatePublisher = (
  state: ProductEngineLifecycleState,
  operation: ProductLifecycleOperation,
  error?: unknown,
) => void;

export type ProductLifecycleDelegate = {
  preloadRuntime(): Promise<void>;
  startRuntime(): Promise<void>;
  stopRuntime(): Promise<void>;
  suspendRuntime(): Promise<void>;
  resumeRuntime(): Promise<void>;
  disposeRuntime?: () => Promise<void>;
  publishState: ProductLifecycleStatePublisher;
};

export class ProductRuntimeLifecycleController {
  private serial: Promise<unknown> = Promise.resolve();
  private opId = 0;
  private status: ProductRuntimeLifecycleState = 'cold';
  private lastOperation: ProductLifecycleOperation | null = null;
  private lastError: unknown = null;
  private lastRejectedReason: string | null = null;

  constructor(private readonly delegate: ProductLifecycleDelegate) {}

  get currentStatus(): ProductEngineLifecycleState {
    return this.status;
  }

  get currentOperation(): ProductLifecycleOperation | null {
    return this.lastOperation;
  }

  get currentError(): unknown {
    return this.lastError;
  }

  get lastRejectedTransitionReason(): string | null {
    return this.lastRejectedReason;
  }

  preload(): Promise<void> {
    return this.runIntent('preload', 'preloading', 'ready', () => this.delegate.preloadRuntime());
  }

  start(): Promise<void> {
    return this.runIntent('start', 'starting', 'running', () => this.delegate.startRuntime());
  }

  stop(): Promise<void> {
    return this.runIntent('stop', 'stopping', 'stopped', () => this.delegate.stopRuntime());
  }

  suspend(): Promise<void> {
    return this.runIntent('suspend', 'suspending', 'suspended', () => this.delegate.suspendRuntime());
  }

  resume(): Promise<void> {
    return this.runIntent('resume', 'starting', 'running', () => this.delegate.resumeRuntime());
  }

  dispose(): Promise<void> {
    return this.runIntent('dispose', 'disposed', 'disposed', () => this.delegate.disposeRuntime?.() ?? Promise.resolve());
  }

  fail(error?: unknown): Promise<void> {
    return this.runIntent('fail', 'failed', 'failed', async () => {
      if (error !== undefined) throw error;
    }, { swallowRunError: true });
  }

  private runIntent(
    operation: ProductLifecycleOperation,
    pending: ProductRuntimeLifecycleState,
    success: ProductRuntimeLifecycleState,
    run: () => Promise<void>,
    options: { swallowRunError?: boolean } = {},
  ): Promise<void> {
    if (!this.isIntentAllowed(operation)) {
      this.recordRejectedTransition(operation);
      return Promise.resolve();
    }
    return this.enqueue(operation, pending, success, run, options);
  }

  private enqueue(
    operation: ProductLifecycleOperation,
    pending: ProductRuntimeLifecycleState,
    success: ProductRuntimeLifecycleState,
    run: () => Promise<void>,
    options: { swallowRunError?: boolean } = {},
  ): Promise<void> {
    const id = ++this.opId;
    const task = async (): Promise<void> => {
      this.setStatus(pending, operation);
      try {
        await run();
        if (id === this.opId && success !== pending) this.setStatus(success, operation);
      } catch (error) {
        if (id === this.opId) this.setStatus('failed', operation, error);
        if (options.swallowRunError) return;
        throw error;
      }
    };

    const result = this.serial.then(task, task);
    this.serial = result.catch(() => undefined);
    return result;
  }

  private setStatus(
    status: ProductRuntimeLifecycleState,
    operation: ProductLifecycleOperation,
    error?: unknown,
  ): void {
    this.status = status;
    this.lastOperation = operation;
    this.lastError = error ?? null;
    this.lastRejectedReason = null;
    this.delegate.publishState(status, operation, error);
  }

  private isIntentAllowed(intent: ProductRuntimeLifecycleIntent): boolean {
    return PRODUCT_RUNTIME_ALLOWED_INTENTS[this.status].includes(intent);
  }

  private recordRejectedTransition(intent: ProductRuntimeLifecycleIntent): void {
    const duplicateReason = this.duplicateReason(intent);
    this.lastRejectedReason = duplicateReason ?? `illegal-${intent}-while-${this.status}`;
    this.lastOperation = intent;
    this.delegate.publishState(this.status, intent);
  }

  private duplicateReason(intent: ProductRuntimeLifecycleIntent): string | null {
    if (intent === 'start' && this.status === 'running') return 'duplicate-start';
    if (intent === 'preload' && (this.status === 'ready' || this.status === 'running')) return 'duplicate-preload';
    if (intent === 'suspend' && this.status === 'suspended') return 'duplicate-suspend';
    if (intent === 'resume' && this.status === 'running') return 'duplicate-resume';
    if (intent === 'stop' && this.status === 'stopped') return 'duplicate-stop';
    if (intent === 'dispose' && this.status === 'disposed') return 'duplicate-dispose';
    return null;
  }
}
