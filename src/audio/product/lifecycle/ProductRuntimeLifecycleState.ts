export type ProductRuntimeLifecycleState =
  | 'cold'
  | 'preloading'
  | 'ready'
  | 'starting'
  | 'running'
  | 'suspending'
  | 'suspended'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'disposed';

export type ProductRuntimeLifecycleIntent =
  | 'preload'
  | 'start'
  | 'resume'
  | 'suspend'
  | 'stop'
  | 'dispose'
  | 'fail';

export const PRODUCT_RUNTIME_ALLOWED_INTENTS: Record<ProductRuntimeLifecycleState, readonly ProductRuntimeLifecycleIntent[]> = {
  cold: ['preload', 'start', 'dispose', 'fail'],
  preloading: ['dispose', 'fail'],
  ready: ['start', 'dispose', 'fail'],
  starting: ['stop', 'dispose', 'fail'],
  running: ['suspend', 'stop', 'dispose', 'fail'],
  suspending: ['resume', 'stop', 'dispose', 'fail'],
  suspended: ['resume', 'stop', 'dispose', 'fail'],
  stopping: ['dispose', 'fail'],
  stopped: ['start', 'dispose', 'fail'],
  failed: ['stop', 'dispose'],
  disposed: [],
};
