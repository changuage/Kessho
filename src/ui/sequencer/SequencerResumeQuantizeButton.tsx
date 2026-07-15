import type { SliderState } from '../state';
import {
  nextSequencerResumeQuantization,
  sequencerResumeQuantizationKey,
  sequencerResumeQuantizationLabel,
  type SequencerResumeKind,
} from '../../audio/sequencerResumeQuantization';

export function SequencerResumeQuantizeButton({
  state,
  kind,
  laneIndex,
  onSelectChange,
}: {
  state: SliderState;
  kind: SequencerResumeKind;
  laneIndex: number;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
}) {
  const key = sequencerResumeQuantizationKey(kind, laneIndex + 1);
  const label = sequencerResumeQuantizationLabel(state[key]);
  return (
    <button
      type="button"
      className="seq-resume-quantize-btn"
      onClick={() => onSelectChange(key, nextSequencerResumeQuantization(state[key]) as SliderState[typeof key])}
      title={`Unmute quantization: ${label}. Click to cycle.`}
      aria-label={`Unmute quantization: ${label}`}
    >
      Unmute: {label}
    </button>
  );
}
