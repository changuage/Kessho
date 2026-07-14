import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';

export type SynthKeyboardKeyView = {
  readonly code: string;
  readonly shortcut: string;
  readonly layoutIndex: number;
  readonly noteLabel: string;
  readonly whiteIndex: number;
  readonly harmonyStatus: 'root' | 'chord' | 'scale' | 'outside';
  readonly accidental: boolean;
};

export type SynthKeyboardKeysHandle = {
  readonly press: (code: string, inputId: string) => void;
  readonly release: (inputId: string) => void;
  readonly releaseAll: () => void;
};

type SynthKeyboardKeysProps = {
  readonly naturalKeys: readonly SynthKeyboardKeyView[];
  readonly accidentalKeys: readonly SynthKeyboardKeyView[];
  readonly whiteKeyCount: number;
  readonly onNoteOn: (key: SynthKeyboardKeyView, inputId: string) => void;
  readonly onNoteOff: (inputId: string) => void;
};

export const SynthKeyboardKeys = forwardRef<SynthKeyboardKeysHandle, SynthKeyboardKeysProps>(function SynthKeyboardKeys({
  naturalKeys,
  accidentalKeys,
  whiteKeyCount,
  onNoteOn,
  onNoteOff,
}, ref) {
  const [activeInputs, setActiveInputs] = useState<ReadonlyMap<string, string>>(() => new Map());
  const activeCodeSet = useMemo(() => new Set(activeInputs.values()), [activeInputs]);
  const press = useCallback((code: string, inputId: string) => {
    setActiveInputs((previous) => {
      if (previous.get(inputId) === code) return previous;
      return new Map(previous).set(inputId, code);
    });
  }, []);
  const release = useCallback((inputId: string) => {
    setActiveInputs((previous) => {
      if (!previous.has(inputId)) return previous;
      const inputs = new Map(previous);
      inputs.delete(inputId);
      return inputs;
    });
  }, []);
  const releaseAll = useCallback(() => setActiveInputs((previous) => previous.size > 0 ? new Map() : previous), []);

  useImperativeHandle(ref, () => ({ press, release, releaseAll }), [press, release, releaseAll]);

  const renderKey = (key: SynthKeyboardKeyView, kind: 'natural' | 'accidental') => {
    const pointerInputId = (pointerId: number) => `pointer:${pointerId}:${key.code}`;
    return (
      <button
        key={key.code}
        type="button"
        className={`synth-keyboard-key ${kind} harmony-${key.harmonyStatus}${activeCodeSet.has(key.code) ? ' active' : ''}`}
        style={kind === 'accidental' ? { gridColumn: `${key.whiteIndex + 1} / span 1` } : undefined}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const inputId = pointerInputId(event.pointerId);
          press(key.code, inputId);
          onNoteOn(key, inputId);
        }}
        onPointerUp={(event) => {
          const inputId = pointerInputId(event.pointerId);
          release(inputId);
          onNoteOff(inputId);
        }}
        onPointerCancel={(event) => {
          const inputId = pointerInputId(event.pointerId);
          release(inputId);
          onNoteOff(inputId);
        }}
        onLostPointerCapture={(event) => {
          const inputId = pointerInputId(event.pointerId);
          release(inputId);
          onNoteOff(inputId);
        }}
      >
        <span className="synth-keyboard-key-shortcut">{key.shortcut}</span>
        <span className="synth-keyboard-key-note">{key.noteLabel}</span>
      </button>
    );
  };

  return (
    <div className="synth-keyboard-grid" style={{ '--white-key-count': whiteKeyCount } as React.CSSProperties}>
      <div className="synth-keyboard-natural-row">
        {naturalKeys.map((key) => renderKey(key, 'natural'))}
      </div>
      <div className="synth-keyboard-accidental-row">
        {accidentalKeys.map((key) => renderKey(key, 'accidental'))}
      </div>
    </div>
  );
});

export default React.memo(SynthKeyboardKeys);
