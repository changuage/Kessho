import type { ProductEngineLifecycleState } from '../ProductEngineTypes';

export type ProductLifecycleOperation =
  | 'preload'
  | 'start'
  | 'stop'
  | 'suspend'
  | 'resume';

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
  publishState: ProductLifecycleStatePublisher;
};

export class ProductRuntimeLifecycleController {
  private serial: Promise<unknown> = Promise.resolve();
  private opId = 0;
  private status: ProductEngineLifecycleState = 'cold';
  private lastOperation: ProductLifecycleOperation | null = null;
  private lastError: unknown = null;

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

  preload(): Promise<void> {
    if (this.status !== 'cold') return Promise.resolve();
    return this.enqueue('preload', 'loading', 'ready', () => this.delegate.preloadRuntime());
  }

  start(): Promise<void> {
    return this.enqueue('start', 'loading', 'running', () => this.delegate.startRuntime());
  }

  stop(): Promise<void> {
    if (this.status === 'stopped') return Promise.resolve();
    return this.enqueue('stop', 'loading', 'stopped', () => this.delegate.stopRuntime());
  }

  suspend(): Promise<void> {
    if (this.status === 'suspended') return Promise.resolve();
    return this.enqueue('suspend', 'loading', 'suspended', () => this.delegate.suspendRuntime());
  }

  resume(): Promise<void> {
    if (this.status === 'running') return Promise.resolve();
    return this.enqueue('resume', 'loading', 'running', () => this.delegate.resumeRuntime());
  }

  private enqueue(
    operation: ProductLifecycleOperation,
    pending: ProductEngineLifecycleState,
    success: ProductEngineLifecycleState,
    run: () => Promise<void>,
  ): Promise<void> {
    const id = ++this.opId;
    const task = async (): Promise<void> => {
      this.setStatus(pending, operation);
      try {
        await run();
        if (id === this.opId) this.setStatus(success, operation);
      } catch (error) {
        if (id === this.opId) this.setStatus('failed', operation, error);
        throw error;
      }
    };

    const result = this.serial.then(task, task);
    this.serial = result.catch(() => undefined);
    return result;
  }

  private setStatus(
    status: ProductEngineLifecycleState,
    operation: ProductLifecycleOperation,
    error?: unknown,
  ): void {
    this.status = status;
    this.lastOperation = operation;
    this.lastError = error ?? null;
    this.delegate.publishState(status, operation, error);
  }
}
