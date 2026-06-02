import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveOverdubStatus = 'idle' | 'count-in' | 'recording';

type LiveOverdubOptions = {
  bpm: number;
  countInBeats?: number;
  onCountInComplete?: () => void;
};

type LiveOverdubRecorder = {
  status: LiveOverdubStatus;
  isRecording: boolean;
  isArmed: boolean;
  countInRemaining: number;
  metronomeEnabled: boolean;
  start: () => void;
  stop: () => void;
  toggleMetronome: () => void;
};

const MIN_BPM = 40;
const MAX_BPM = 300;

function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return 120;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, value));
}

function beatDurationMs(bpm: number): number {
  return (60_000 / clampBpm(bpm));
}

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

export function liveOverdubTargetStep(
  playheadStep: number | undefined,
  fallbackStep: number,
  stepCount: number,
): number {
  const safeStepCount = Math.max(1, Math.round(stepCount));
  const source = typeof playheadStep === 'number' && Number.isFinite(playheadStep)
    ? playheadStep
    : fallbackStep;
  return modulo(Math.round(source), safeStepCount);
}

export function useLiveOverdubRecorder({
  bpm,
  countInBeats = 4,
  onCountInComplete,
}: LiveOverdubOptions): LiveOverdubRecorder {
  const [status, setStatus] = useState<LiveOverdubStatus>('idle');
  const [countInRemaining, setCountInRemaining] = useState(0);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const statusRef = useRef(status);
  const bpmRef = useRef(bpm);
  const onCountInCompleteRef = useRef(onCountInComplete);
  const countInBeatsRef = useRef(countInBeats);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    onCountInCompleteRef.current = onCountInComplete;
  }, [onCountInComplete]);

  useEffect(() => {
    countInBeatsRef.current = countInBeats;
  }, [countInBeats]);

  const click = useCallback((accent = false) => {
    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;
    if (context.state === 'suspended') void context.resume();

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(accent ? 1320 : 880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.12 : 0.075, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.06);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }, []);

  const stop = useCallback(() => {
    setStatus('idle');
    setCountInRemaining(0);
  }, []);

  const start = useCallback(() => {
    if (statusRef.current !== 'idle') {
      stop();
      return;
    }
    const beats = Math.max(1, Math.round(countInBeatsRef.current));
    setCountInRemaining(beats);
    setStatus('count-in');
  }, [stop]);

  const toggleMetronome = useCallback(() => {
    setMetronomeEnabled((current) => !current);
  }, []);

  useEffect(() => {
    if (status !== 'count-in') return undefined;

    let remaining = Math.max(1, Math.round(countInBeatsRef.current));
    setCountInRemaining(remaining);
    click(true);

    const interval = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(interval);
        setCountInRemaining(0);
        onCountInCompleteRef.current?.();
        setStatus('recording');
        return;
      }
      setCountInRemaining(remaining);
      click(remaining === 1);
    }, beatDurationMs(bpmRef.current));

    return () => window.clearInterval(interval);
  }, [click, status]);

  useEffect(() => {
    if (status !== 'recording' || !metronomeEnabled) return undefined;

    let beat = 0;
    click(true);
    const interval = window.setInterval(() => {
      beat += 1;
      click(beat % 4 === 0);
    }, beatDurationMs(bpmRef.current));

    return () => window.clearInterval(interval);
  }, [click, metronomeEnabled, status]);

  return {
    status,
    isRecording: status === 'recording',
    isArmed: status !== 'idle',
    countInRemaining,
    metronomeEnabled,
    start,
    stop,
    toggleMetronome,
  };
}
