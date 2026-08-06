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
  // A user can request playback while the mount-time preload is still
  // fetching/initializing the worklet. ProductRuntimeLifecycleController
  // serializes the start behind that in-flight preload, so this intent must
  // remain legal instead of resolving as a silent no-op.
  preloading: ['start', 'dispose', 'fail'],
  ready: ['start', 'dispose', 'fail'],
  starting: ['stop', 'dispose', 'fail'],
  running: ['suspend', 'stop', 'dispose', 'fail'],
  suspending: ['resume', 'stop', 'dispose', 'fail'],
  suspended: ['resume', 'stop', 'dispose', 'fail'],
  stopping: ['dispose', 'fail'],
  stopped: ['start', 'dispose', 'fail'],
  failed: ['start', 'stop', 'dispose'],
  disposed: [],
};
