import type { CaptureSession } from './generatedSequencerCaptureTypes';
import './SequencerCapture.css';

interface SequencerCaptureButtonProps {
  laneIndex: number;
  mode: 'anchorWalker' | 'orbit';
  session: CaptureSession | null;
  capturedCount: number;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}

export function SequencerCaptureButton({
  laneIndex,
  mode,
  session,
  capturedCount,
  onStart,
  onStop,
  onCancel,
}: SequencerCaptureButtonProps) {
  const isThisLane = session?.sourceLaneIndex === laneIndex;
  const active = isThisLane && session?.active;

  if (isThisLane && session?.status === 'committing') {
    return (
      <div className="seq-capture-pill seq-capture-pill--active">
        <span className="seq-capture-dot" />
        <span>Saving to Euclid...</span>
        <span className="seq-capture-count">{capturedCount} steps</span>
      </div>
    );
  }

  if (active) {
    return (
      <div className="seq-capture-pill seq-capture-pill--active">
        <span className="seq-capture-dot" />
        <span>Capturing → Euclid · generated + live keys · Stop to save the last loop</span>
        <span className="seq-capture-count">{capturedCount} steps</span>
        <button type="button" onClick={onStop}>Stop</button>
        <button type="button" onClick={onCancel} aria-label="Cancel capture">Cancel</button>
      </div>
    );
  }

  if (isThisLane && session?.status === 'empty') {
    return (
      <div className="seq-capture-pill seq-capture-pill--empty">
        No notes captured
      </div>
    );
  }

  if (isThisLane && session?.status === 'committed') {
    return (
      <div className="seq-capture-pill seq-capture-pill--done">
        Saved to Euclid
      </div>
    );
  }

  return (
    <button
      type="button"
      className="seq-capture-button"
      onClick={onStart}
      title="Record this generated pattern and live keyboard notes into a normal Euclidean sequence. It keeps overwriting the loop until you press Stop."
      aria-label={`Capture ${mode === 'orbit' ? 'Orbit' : 'Walker'} to Euclid`}
    >
      Capture
    </button>
  );
}

export default SequencerCaptureButton;
