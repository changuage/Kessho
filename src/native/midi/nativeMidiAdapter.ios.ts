import {
  addCapacitorMidiActivityListener,
  addCapacitorMidiInputsChangedListener,
  addCapacitorMidiMessageListener,
  connectCapacitorMidiInput,
  disconnectAllCapacitorMidiInputs,
  disconnectCapacitorMidiInput,
  getCapacitorMidiRoutingStatus,
  refreshCapacitorMidiInputs,
  setCapacitorMidiConnectedInputs,
  startCapacitorMidiRouting,
  stopCapacitorMidiRouting,
  type KesshoMidiEndpointInfo,
  type KesshoMidiInputSnapshot,
  type KesshoMidiMessage,
  type KesshoMidiStatus,
} from '../capacitorMidiRouting';

export type NativeMidiAdapterPlatform = 'macos' | 'ios' | 'web' | 'unavailable';

export interface NativeMidiAdapter {
  platform: NativeMidiAdapterPlatform;
  start(): Promise<void>;
  stop(): Promise<void>;
  refreshInputs(): Promise<KesshoMidiEndpointInfo[]>;
  connectInput(id: number): Promise<void>;
  disconnectInput(id: number): Promise<void>;
  disconnectAll(): Promise<void>;
  setConnectedInputs(ids: number[]): Promise<void>;
  addMessageListener(listener: (message: KesshoMidiMessage) => void): () => void;
  addActivityListener(listener: (message: KesshoMidiMessage) => void): () => void;
  addInputsChangedListener(listener: (snapshot: KesshoMidiInputSnapshot) => void): () => void;
  getStatus(): Promise<KesshoMidiStatus>;
}

type AsyncCleanup = () => Promise<void>;

function defaultStatus(): KesshoMidiStatus {
  return {
    available: false,
    isStarted: false,
    inputCount: 0,
    connectedInputIDs: [],
    lastErrorMessage: 'KesshoMidiRouting Capacitor plugin unavailable',
  };
}

export function createIOSNativeMidiAdapter(): NativeMidiAdapter {
  const cleanups = new Set<AsyncCleanup>();

  function createListenerCleanup(promise: Promise<AsyncCleanup | null>): () => void {
    let settledCleanup: AsyncCleanup | null = null;
    void promise.then((cleanup) => {
      if (!cleanup) return;
      settledCleanup = cleanup;
      cleanups.add(cleanup);
    });
    return () => {
      if (!settledCleanup) return;
      cleanups.delete(settledCleanup);
      void settledCleanup();
    };
  }

  return {
    platform: 'ios',

    async start() {
      await startCapacitorMidiRouting();
    },

    async stop() {
      const pending = [...cleanups];
      cleanups.clear();
      await Promise.allSettled(pending.map((cleanup) => cleanup()));
      await stopCapacitorMidiRouting();
    },

    async refreshInputs() {
      const snapshot = await refreshCapacitorMidiInputs();
      return snapshot?.inputs ?? [];
    },

    async connectInput(id: number) {
      await connectCapacitorMidiInput(id);
    },

    async disconnectInput(id: number) {
      await disconnectCapacitorMidiInput(id);
    },

    async disconnectAll() {
      await disconnectAllCapacitorMidiInputs();
    },

    async setConnectedInputs(ids: number[]) {
      await setCapacitorMidiConnectedInputs(ids);
    },

    addMessageListener(listener: (message: KesshoMidiMessage) => void) {
      return createListenerCleanup(addCapacitorMidiMessageListener(listener));
    },

    addActivityListener(listener: (message: KesshoMidiMessage) => void) {
      return createListenerCleanup(addCapacitorMidiActivityListener(listener));
    },

    addInputsChangedListener(listener: (snapshot: KesshoMidiInputSnapshot) => void) {
      return createListenerCleanup(addCapacitorMidiInputsChangedListener(listener));
    },

    async getStatus() {
      return (await getCapacitorMidiRoutingStatus()) ?? defaultStatus();
    },
  };
}
