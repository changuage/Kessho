import type { CaptureSession } from './generatedSequencerCaptureTypes';
import './SequencerCapture.css';

interface SequencerCapturePreviewOverlayProps {
  session: CaptureSession | null;
  laneIndex: number;
}

export function SequencerCapturePreviewOverlay({
  session,
  laneIndex,
}: SequencerCapturePreviewOverlayProps) {
  if (!session || session.targetLaneIndex !== laneIndex) return null;

  const { scratch } = session;
  return (
    <div
      className="seq-capture-preview"
      style={{ gridTemplateColumns: `repeat(${scratch.stepCount}, minmax(0, 1fr))` }}
    >
      {scratch.cells.map((cell, index) => (
        <div
          key={index}
          className={[
            'seq-capture-preview-cell',
            cell.hasNote ? 'seq-capture-preview-cell--note' : '',
            scratch.lastStepIndex === index ? 'seq-capture-preview-cell--head' : '',
          ].filter(Boolean).join(' ')}
          title={
            cell.hasNote
              ? `Captured ${cell.midiNote} / vel ${Math.round((cell.velocity ?? 1) * 100)}%`
              : `Step ${index + 1}`
          }
        >
          {cell.hasNote ? <span /> : null}
        </div>
      ))}
    </div>
  );
}

export default SequencerCapturePreviewOverlay;
