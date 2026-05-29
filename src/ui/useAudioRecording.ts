import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { referenceAudioEngineDebug } from '../audio/reference/ReferenceAudioEngineDebugCompat';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import {
  RECORD_TRACK_FILENAME_SUFFIX,
  STEM_RECORD_DEFAULTS,
  STEM_RECORD_TRACK_IDS,
  type RecordTrackId,
  type StemRecordTrackId,
} from '../audio/recordingTracks';
import {
  attachRecorderTap,
  createEmptyRecorderTapSessions,
  disposeRecorderTapSessions,
  flushAndDetachRecorderTapSessions,
  type RecorderTapSessions,
  type RecorderWorkerFinalizedMessage,
  type RecordingStreamDestination,
} from '../audio/recording/recorderTap';
import { isMobileDevice } from '../platform';
import { useVisibleInterval } from './hooks/useVisibleInterval';

type RecordingFormats = {
  webm: boolean;
  wav: boolean;
};

export type AudioRecordingControls = {
  isRecording: boolean;
  isRecordingArmed: boolean;
  recordingAvailable: boolean;
  recordingDuration: number;
  recordFormats: RecordingFormats;
  recordStems: Record<StemRecordTrackId, boolean>;
  stemRecordingAvailable: boolean;
  setIsRecordingArmed: Dispatch<SetStateAction<boolean>>;
  setRecordFormats: Dispatch<SetStateAction<RecordingFormats>>;
  handleRecordStemsToggle: (key: string) => void;
  handleArmRecording: () => void;
  handleStartRecording: () => Promise<void>;
  handleStopRecording: () => Promise<void>;
  formatRecordingTime: (seconds: number) => string;
};

const recorderTapWorkletUrl = new URL(
  `${import.meta.env.BASE_URL}worklets/recorder-tap.worklet.js`,
  window.location.href,
).toString();

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function downloadRecordingArchive(
  filesToExport: Array<{ filename: string; blob: Blob }>,
  timestamp: string,
): Promise<void> {
  if (filesToExport.length === 0) {
    console.log('No files to export');
    return;
  }

  if (filesToExport.length === 1) {
    const firstFile = filesToExport[0];
    if (!firstFile) return;
    downloadBlob(firstFile.filename, firstFile.blob);
    console.log(`Exported: ${firstFile.filename}`);
    return;
  }

  console.log(`Creating zip archive with ${filesToExport.length} files...`);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const { filename, blob } of filesToExport) {
    zip.file(filename, blob);
  }
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  downloadBlob(`kessho-${timestamp}.zip`, zipBlob);
  console.log(`Exported: kessho-${timestamp}.zip (${filesToExport.length} files)`);
}

export function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function useAudioRecording(audioEngineRuntimeMode: AudioEngineRuntimeMode): AudioRecordingControls {
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingArmed, setIsRecordingArmed] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordFormats, setRecordFormats] = useState<RecordingFormats>({ webm: true, wav: false });
  const [recordStems, setRecordStems] = useState<Record<StemRecordTrackId, boolean>>(STEM_RECORD_DEFAULTS);
  const recordingAvailable = audioEngineRuntimeMode !== 'core-product';
  const stemRecordingAvailable = recordingAvailable;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingStreamDestRef = useRef<RecordingStreamDestination | null>(null);
  const recordingExportWorkerRef = useRef<Worker | null>(null);
  const recorderWorkletContextRef = useRef<AudioContext | null>(null);
  const recorderTapSessionsRef = useRef<RecorderTapSessions>(createEmptyRecorderTapSessions());

  const handleRecordStemsToggle = useCallback((key: string): void => {
    if (audioEngineRuntimeMode === 'core-product') return;
    setRecordStems(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  }, [audioEngineRuntimeMode]);

  const handleArmRecording = useCallback((): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      throw new Error('Recording is explicitly unavailable in core-product until a Product recording bridge exists');
    }
    setIsRecordingArmed(prev => !prev);
  }, [audioEngineRuntimeMode]);

  const ensureRecorderTapWorklet = useCallback(async (ctx: AudioContext): Promise<void> => {
    if (recorderWorkletContextRef.current === ctx) return;
    await ctx.audioWorklet.addModule(recorderTapWorkletUrl);
    recorderWorkletContextRef.current = ctx;
  }, []);

  const ensureRecordingExportWorker = useCallback((): Worker => {
    if (recordingExportWorkerRef.current) return recordingExportWorkerRef.current;
    const worker = new Worker(
      new URL('../audio/recording/exportRecorder.worker.ts', import.meta.url),
      { type: 'module' },
    );
    recordingExportWorkerRef.current = worker;
    return worker;
  }, []);

  const flushRecordingTapSessions = useCallback(
    () => flushAndDetachRecorderTapSessions(recorderTapSessionsRef.current),
    [],
  );

  const finalizeRecordingWorkerFiles = useCallback((timestamp: string) => {
    const worker = recordingExportWorkerRef.current;
    if (!worker) return Promise.resolve<Array<{ filename: string; blob: Blob }>>([]);

    return new Promise<Array<{ filename: string; blob: Blob }>>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<RecorderWorkerFinalizedMessage>) => {
        if (event.data?.type !== 'finalized') return;
        worker.removeEventListener('message', handleMessage as EventListener);
        worker.removeEventListener('error', handleError as EventListener);
        const files = event.data.files.map(({ trackId, blob, totalFrames }) => {
          const suffix = RECORD_TRACK_FILENAME_SUFFIX[trackId];
          const filename = suffix
            ? `kessho-${timestamp}-${suffix}.wav`
            : `kessho-${timestamp}.wav`;
          console.log(`Prepared ${filename} (${totalFrames} frames, 24-bit WAV)`);
          return { filename, blob };
        });
        worker.terminate();
        recordingExportWorkerRef.current = null;
        resolve(files);
      };

      const handleError = (event: Event) => {
        worker.removeEventListener('message', handleMessage as EventListener);
        worker.removeEventListener('error', handleError as EventListener);
        worker.terminate();
        recordingExportWorkerRef.current = null;
        reject(event);
      };

      worker.addEventListener('message', handleMessage as EventListener);
      worker.addEventListener('error', handleError as EventListener);
      worker.postMessage({ type: 'finalize' });
    });
  }, []);

  useEffect(() => () => {
    disposeRecorderTapSessions(recorderTapSessionsRef.current);
    recordingExportWorkerRef.current?.terminate();
    recordingExportWorkerRef.current = null;
  }, []);

  const handleStartRecording = useCallback(async (): Promise<void> => {
    if (audioEngineRuntimeMode === 'core-product') {
      throw new Error('Recording is explicitly unavailable in core-product until a Product recording bridge exists');
    }
    const ctx = referenceAudioEngineDebug.getAudioContext();
    const limiterNode = referenceAudioEngineDebug.getLimiterNode();
    if (!ctx || !limiterNode) {
      console.error('Audio context not available for recording');
      return;
    }

    if (!recordFormats.webm && !recordFormats.wav) {
      alert('Please select at least one recording format (WebM or WAV)');
      return;
    }

    const enabledStemIds = STEM_RECORD_TRACK_IDS.filter((trackId) => recordStems[trackId]);
    if (isMobileDevice() && (recordFormats.wav || enabledStemIds.length > 0)) {
      alert('Mobile recording is limited to the stereo WebM mix to avoid high CPU and memory use. Disable WAV and stem capture, or record on desktop.');
      return;
    }

    try {
      if (recordFormats.webm) {
        const streamDest = ctx.createMediaStreamDestination();
        limiterNode.connect(streamDest);
        recordingStreamDestRef.current = streamDest;

        const mediaRecorder = new MediaRecorder(streamDest.stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 256000,
        });

        recordedChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(1000);
        mediaRecorderRef.current = mediaRecorder;
      }

      const trackIdsToCapture: RecordTrackId[] = [];
      if (recordFormats.wav) trackIdsToCapture.push('mix');
      trackIdsToCapture.push(...enabledStemIds);

      if (trackIdsToCapture.length > 0) {
        await ensureRecorderTapWorklet(ctx);
        const worker = ensureRecordingExportWorker();
        worker.postMessage({
          type: 'init',
          sampleRate: ctx.sampleRate,
          trackIds: trackIdsToCapture,
        });

        if (recordFormats.wav) {
          attachRecorderTap({ ctx, trackId: 'mix', sourceNode: limiterNode, worker, sessions: recorderTapSessionsRef.current });
        }

        if (enabledStemIds.length > 0) {
          const recordableNodes = referenceAudioEngineDebug.getRecordableBusNodes();
          for (const stemName of enabledStemIds) {
            const stemSource = recordableNodes[stemName];
            if (!stemSource?.node) {
              console.warn(`Stem node not available for ${stemName}`);
              continue;
            }
            attachRecorderTap({
              ctx,
              trackId: stemName,
              sourceNode: stemSource.node,
              worker,
              sessions: recorderTapSessionsRef.current,
              outputIndex: stemSource.outputIndex ?? 0,
            });
            console.log(`Stem recording started for: ${stemName}`);
          }
        }
      }

      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);

      const formats = [recordFormats.webm && 'WebM', recordFormats.wav && 'WAV'].filter(Boolean).join(' + ');
      const stemCount = enabledStemIds.length;
      const stemInfo = stemCount > 0 ? ` + ${stemCount} stems` : '';
      console.log(`Recording started: ${formats}${stemInfo}`);
    } catch (err) {
      console.error('Failed to start recording:', err);
      await flushRecordingTapSessions();
      recordingExportWorkerRef.current?.terminate();
      recordingExportWorkerRef.current = null;
      if (recordingStreamDestRef.current && limiterNode) {
        try {
          limiterNode.disconnect(recordingStreamDestRef.current);
        } catch { /* noop */ }
        recordingStreamDestRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch { /* noop */ }
      }
      mediaRecorderRef.current = null;
    }
  }, [
    audioEngineRuntimeMode,
    ensureRecorderTapWorklet,
    ensureRecordingExportWorker,
    flushRecordingTapSessions,
    recordFormats,
    recordStems,
  ]);

  const handleStopRecording = useCallback(async (): Promise<void> => {
    if (audioEngineRuntimeMode === 'core-product') {
      setIsRecording(false);
      setRecordingDuration(0);
      return;
    }
    const limiterNode = referenceAudioEngineDebug.getLimiterNode();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    const filesToZip: Array<{ filename: string; blob: Blob }> = [];
    let webmFilePromise: Promise<{ filename: string; blob: Blob } | null> = Promise.resolve(null);

    if (recordFormats.webm && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      webmFilePromise = new Promise((resolve) => {
        mediaRecorderRef.current!.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
          if (recordingStreamDestRef.current && limiterNode) {
            try {
              limiterNode.disconnect(recordingStreamDestRef.current);
            } catch { /* noop */ }
            recordingStreamDestRef.current = null;
          }
          mediaRecorderRef.current = null;
          console.log('WebM prepared');
          resolve({ filename: `kessho-${timestamp}.webm`, blob });
        };
      });
      mediaRecorderRef.current.stop();
    } else if (recordingStreamDestRef.current && limiterNode) {
      try {
        limiterNode.disconnect(recordingStreamDestRef.current);
      } catch { /* noop */ }
      recordingStreamDestRef.current = null;
    }

    try {
      await flushRecordingTapSessions();
      const [webmFile, wavFiles] = await Promise.all([
        webmFilePromise,
        finalizeRecordingWorkerFiles(timestamp),
      ]);

      if (webmFile) filesToZip.push(webmFile);
      filesToZip.push(...wavFiles);
      await downloadRecordingArchive(filesToZip, timestamp);
    } catch (error) {
      console.error('Failed to finalize recording:', error);
      recordingExportWorkerRef.current?.terminate();
      recordingExportWorkerRef.current = null;
    }

    setIsRecording(false);
    setRecordingDuration(0);
    console.log('Recording stopped');
  }, [audioEngineRuntimeMode, finalizeRecordingWorkerFiles, flushRecordingTapSessions, recordFormats.webm]);

  useVisibleInterval(() => {
    const nextDuration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
    setRecordingDuration(prev => (prev === nextDuration ? prev : nextDuration));
  }, 1000, {
    enabled: isRecording,
    immediate: false,
  });

  return {
    isRecording,
    isRecordingArmed,
    recordingAvailable,
    recordingDuration,
    recordFormats,
    recordStems,
    stemRecordingAvailable,
    setIsRecordingArmed,
    setRecordFormats,
    handleRecordStemsToggle,
    handleArmRecording,
    handleStartRecording,
    handleStopRecording,
    formatRecordingTime,
  };
}
