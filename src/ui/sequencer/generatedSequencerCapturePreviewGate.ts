export interface GeneratedSequencerCapturePreviewGate<T> {
  publishAuthoritative: (value: T) => void;
  setDocumentVisible: (visible: boolean) => void;
  dispose: () => void;
}

export interface GeneratedSequencerCapturePreviewGateOptions<T> {
  initialDocumentVisible: boolean;
  initialValue: T;
  onPreview: (value: T) => void;
  scheduleFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
}

export function createGeneratedSequencerCapturePreviewGate<T>({
  initialDocumentVisible,
  initialValue,
  onPreview,
  scheduleFrame,
  cancelFrame,
}: GeneratedSequencerCapturePreviewGateOptions<T>): GeneratedSequencerCapturePreviewGate<T> {
  let documentVisible = initialDocumentVisible;
  let authoritativeValue = initialValue;
  let pendingFrame: number | null = null;
  let frameGeneration = 0;
  let disposed = false;

  const cancelPendingFrame = (): void => {
    if (pendingFrame === null) return;
    cancelFrame(pendingFrame);
    pendingFrame = null;
    frameGeneration += 1;
  };

  const publishPendingPreview = (generation: number): void => {
    if (disposed || generation !== frameGeneration) return;
    pendingFrame = null;
    if (!documentVisible) return;
    onPreview(authoritativeValue);
  };

  const publishAuthoritative = (value: T): void => {
    if (disposed) return;
    authoritativeValue = value;
    if (!documentVisible || pendingFrame !== null) return;
    const generation = frameGeneration;
    pendingFrame = scheduleFrame(() => publishPendingPreview(generation));
  };

  const setDocumentVisible = (visible: boolean): void => {
    if (disposed) return;
    if (!visible) {
      documentVisible = false;
      cancelPendingFrame();
      return;
    }

    const wasHidden = !documentVisible;
    documentVisible = true;
    if (!wasHidden) return;

    cancelPendingFrame();
    onPreview(authoritativeValue);
  };

  return {
    publishAuthoritative,
    setDocumentVisible,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelPendingFrame();
    },
  };
}
