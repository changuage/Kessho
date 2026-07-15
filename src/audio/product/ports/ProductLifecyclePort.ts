import type {
  ProductEngineLifecycleState,
  ProductEngineStartOptions,
  ProductEngineState,
} from '../ProductEngineTypes';
import type { ProductEngineRuntimeMode } from '../ProductRuntimeMode';

export type ProductEngineLifecyclePort = {
  readonly mode: ProductEngineRuntimeMode;

  preload(): Promise<void>;
  primeAudioContext(): void;
  start(options?: ProductEngineStartOptions): Promise<void>;
  stop(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  getLifecycleState(): ProductEngineLifecycleState;
  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void;
};
