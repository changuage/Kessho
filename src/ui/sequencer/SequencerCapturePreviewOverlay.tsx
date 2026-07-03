import type { CaptureSession } from './generatedSequencerCaptureTypes';
import { captureScratchForDisplay } from './generatedSequencerCaptureScratch';
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

  const scratch = captureScratchForDisplay(session);
  const noteCounts = new Array(scratch.stepCount).fill(0) as number[];
  for (const event of scratch.events) {
    if (event.targetStepIndex >= 0 && event.targetStepIndex < scratch.stepCount) {
      noteCounts[event.targetStepIndex] = (noteCounts[event.targetStepIndex] ?? 0) + 1;
    }
  }

  return (
    <div
      className="seq-capture-preview"
      style={{ gridTemplateColumns: `repeat(${scratch.stepCount}, minmax(0, 1fr))` }}
    >
      {scratch.cells.map((cell, index) => {
        const noteCount = noteCounts[index] ?? 0;
        const hasNote = noteCount > 0 || cell.hasNote;
        return (
          <div
            key={index}
            className={[
              'seq-capture-preview-cell',
              hasNote ? 'seq-capture-preview-cell--note' : '',
              scratch.lastStepIndex === index ? 'seq-capture-preview-cell--head' : '',
            ].filter(Boolean).join(' ')}
            title={
              hasNote
                ? `Captured ${noteCount || 1} note${noteCount === 1 ? '' : 's'}${cell.midiNote != null ? ` / latest ${cell.midiNote}` : ''}`
                : `Step ${index + 1}`
            }
          >
            {hasNote ? <span>{noteCount > 1 ? noteCount : ''}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

export default SequencerCapturePreviewOverlay;
