import { productEngine } from '../../src/audio/product/ProductEngineProxy';
import { createProductVoiceStepCommit } from '../../src/audio/product/ProductVoiceStepEntryEvents';
import lead4opfmV2PresetBank from '../../src/audio/lead4opfmV2PresetBank.json';
import {
  DynamicVoiceVelocityTracker,
  aggregateVoiceStep,
  analyzeMonophonicPitch,
  midiToNoteName,
  type VoicePitchObservation,
  type VoiceScaleMode,
  type VoiceStepEvent,
} from '../../src/ui/sequencer/voiceStepEntry';
import {
  VoiceOnsetTracker,
  calibrateVoicePitchObservation,
  segmentVoicePhrase,
  type VoicePhraseNote,
} from '../../src/ui/sequencer/voicePhraseInterpreter';

const STEP_COUNT = 16;
const ANALYSIS_INTERVAL_MS = 24;
const FFT_SIZE = 2048;
const TEST_LANE_INDEX = 0;
const TEST_PRESET_ID = 'soft_rhodes';
const PITCH_CALIBRATION_SEMITONES = 2;
const ONSET_CARRY_SECONDS = 0.12;

type CapturePhase = 'idle' | 'count-in' | 'recording' | 'review' | 'committed';
type StepFrameBucket = {
  pitches: VoicePitchObservation[];
  velocities: number[];
  onsetStrength: number;
};
type BrowserAudioSession = { type: 'auto' | 'playback' | 'play-and-record'; state?: string };
type NavigatorWithAudioSession = Navigator & { audioSession?: BrowserAudioSession };

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing prototype element #${id}`);
  return element as T;
};

const pulse = required<HTMLDivElement>('pulse');
const micDot = required<HTMLSpanElement>('micDot');
const micStatus = required<HTMLSpanElement>('micStatus');
const coreDot = required<HTMLSpanElement>('coreDot');
const coreStatus = required<HTMLSpanElement>('coreStatus');
const phaseLabel = required<HTMLDivElement>('phase');
const noteLabel = required<HTMLDivElement>('note');
const centsLabel = required<HTMLSpanElement>('cents');
const velocityLabel = required<HTMLElement>('velocity');
const confidenceLabel = required<HTMLElement>('confidence');
const levelMeter = required<HTMLElement>('level');
const stepReadout = required<HTMLSpanElement>('stepReadout');
const canvas = required<HTMLCanvasElement>('steps');
const bpmInput = required<HTMLInputElement>('bpm');
const laneSelect = required<HTMLSelectElement>('lane');
const rootSelect = required<HTMLSelectElement>('root');
const scaleSelect = required<HTMLSelectElement>('scale');
const recordButton = required<HTMLButtonElement>('record');
const clearButton = required<HTMLButtonElement>('clear');
const keepButton = required<HTMLButtonElement>('keep');
const auditionButton = required<HTMLButtonElement>('audition');
const redoButton = required<HTMLButtonElement>('redo');
const recordActions = required<HTMLDivElement>('recordActions');
const reviewActions = required<HTMLDivElement>('reviewActions');
const hint = required<HTMLDivElement>('hint');
const errorBox = required<HTMLDivElement>('error');
const debugBody = required<HTMLDivElement>('debugBody');

const softRhodesPreset = (lead4opfmV2PresetBank as Array<Record<string, unknown>>)
  .find((preset) => preset.id === TEST_PRESET_ID);
if (!softRhodesPreset) throw new Error('Soft Rhodes preset is missing from lead4opfmV2PresetBank.json');

const SOFT_RHODES_TEST_STATE: Record<string, unknown> = {
  lead1PresetA: TEST_PRESET_ID,
  lead1PresetB: TEST_PRESET_ID,
  lead1PresetAData: softRhodesPreset,
  lead1PresetBData: softRhodesPreset,
  lead1Morph: 0,
  lead1AlgorithmMode: 'presetA',
  lead1Distance: 0,
  lead1UseCustomAdsr: false,
};

let phase: CapturePhase = 'idle';
let micStream: MediaStream | null = null;
let captureContext: AudioContext | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let highPass: BiquadFilterNode | null = null;
let analyser: AnalyserNode | null = null;
let timeDomain: Float32Array | null = null;
let captureReleasePromise: Promise<void> = Promise.resolve();
let animationFrame = 0;
let recordStartTime = 0;
let recordEndTime = 0;
let quarterDuration = 0.6;
let stepDuration = 0.15;
let currentStep = -1;
let lastAnalysisAt = -1;
let lastOnsetAt = Number.NEGATIVE_INFINITY;
let lastOnsetStrength = 0;
let take: VoicePhraseNote[] = [];
let stepBuckets: StepFrameBucket[] = createStepBuckets();
let stepPreview: Array<VoiceStepEvent | null> = Array(STEP_COUNT).fill(null);
let coreBootPromise: Promise<boolean> | null = null;
let coreReady = false;
let lastCoreError: string | null = null;
let auditionTimers: number[] = [];
const velocityTracker = new DynamicVoiceVelocityTracker();
const onsetTracker = new VoiceOnsetTracker();

function browserAudioSession(): BrowserAudioSession | null {
  return (navigator as NavigatorWithAudioSession).audioSession ?? null;
}

function setBrowserAudioSession(type: BrowserAudioSession['type']): void {
  const session = browserAudioSession();
  if (!session) return;
  try { session.type = type; } catch (error) {
    console.warn(`[voice-step-entry] unable to set browser audio session to ${type}`, error);
  }
}

function createStepBuckets(): StepFrameBucket[] {
  return Array.from({ length: STEP_COUNT }, () => ({ pitches: [], velocities: [], onsetStrength: 0 }));
}

function safeBpm(): number {
  const value = Number(bpmInput.value);
  const bpm = Number.isFinite(value) ? Math.max(50, Math.min(220, Math.round(value))) : 100;
  bpmInput.value = String(bpm);
  return bpm;
}

function selectedScale(): VoiceScaleMode {
  const value = scaleSelect.value;
  return value === 'major' || value === 'minor' || value === 'dorian' ? value : 'chromatic';
}

function selectedRoot(): number {
  return Math.max(0, Math.min(11, Math.round(Number(rootSelect.value) || 0)));
}

function setError(message: string | null): void {
  errorBox.textContent = message ?? '';
  errorBox.classList.toggle('visible', Boolean(message));
}

function describeError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Microphone permission was denied. Allow microphone access for this site and try again.';
    if (error.name === 'NotFoundError') return 'No microphone input was found on this device.';
    if (error.name === 'NotReadableError') return `Microphone is unavailable: ${error.message || error.name}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function setMicState(state: 'idle' | 'live' | 'warn', label: string): void {
  micStatus.textContent = label;
  micDot.classList.toggle('live', state === 'live');
  micDot.classList.toggle('warn', state === 'warn');
}

function setCoreState(state: 'cold' | 'starting' | 'live' | 'warn', label: string): void {
  coreStatus.textContent = label;
  coreDot.classList.toggle('live', state === 'live');
  coreDot.classList.toggle('warn', state === 'warn');
}

function rmsOf(samples: Float32Array): number {
  let energy = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] ?? 0;
    energy += value * value;
  }
  return Math.sqrt(energy / Math.max(1, samples.length));
}

function stopMicrophoneTracks(): void {
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop();
    micStream = null;
  }
  setMicState('idle', 'mic idle');
}

function releaseCaptureAudio(): Promise<void> {
  stopMicrophoneTracks();
  try { micSource?.disconnect(); } catch {}
  try { highPass?.disconnect(); } catch {}
  try { analyser?.disconnect(); } catch {}
  micSource = null;
  highPass = null;
  analyser = null;
  timeDomain = null;
  setBrowserAudioSession('auto');
  const context = captureContext;
  captureContext = null;
  if (!context || context.state === 'closed') return Promise.resolve();
  return context.close().catch((error) => console.warn('[voice-step-entry] capture AudioContext close failed', error));
}

function releaseCaptureAudioNow(): void {
  captureReleasePromise = releaseCaptureAudio();
}

function primeProductCoreFromGesture(): void {
  try { productEngine.primeAudioContext(); }
  catch (error) {
    lastCoreError = `primeAudioContext: ${describeError(error)}`;
    setCoreState('warn', 'core prime failed');
  }
}

async function ensureProductCore(): Promise<boolean> {
  if (coreReady && productEngine.getLifecycleState() === 'running') return true;
  if (coreBootPromise) return coreBootPromise;
  coreBootPromise = (async () => {
    await captureReleasePromise;
    try {
      setCoreState('starting', 'core starting · Soft Rhodes');
      lastCoreError = null;
      const lifecycle = productEngine.getLifecycleState();
      if (lifecycle === 'suspended') await productEngine.resume();
      else if (lifecycle !== 'running') await productEngine.start({ initialState: SOFT_RHODES_TEST_STATE });
      coreReady = productEngine.getLifecycleState() === 'running';
      if (!coreReady) lastCoreError = `Lifecycle ended in ${productEngine.getLifecycleState()}`;
      setCoreState(coreReady ? 'live' : 'warn', coreReady ? 'core live · Soft Rhodes' : 'core unavailable');
      return coreReady;
    } catch (error) {
      coreReady = false;
      lastCoreError = `${describeError(error)} · lifecycle ${productEngine.getLifecycleState()}`;
      setCoreState('warn', 'core unavailable');
      console.error('[voice-step-entry] Product Core boot failed', error);
      return false;
    } finally {
      coreBootPromise = null;
      updateDebugPreview(phase === 'committed');
    }
  })();
  return coreBootPromise;
}

async function suspendProductCoreForCapture(): Promise<void> {
  if (productEngine.getLifecycleState() !== 'running') return;
  setCoreState('starting', 'core suspending for mic');
  await productEngine.suspend();
  coreReady = false;
  setCoreState('cold', 'core suspended · Soft Rhodes');
}

async function ensureMicrophone(): Promise<void> {
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    throw new Error('Mobile browsers require HTTPS for microphone input.');
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not expose getUserMedia().');
  releaseCaptureAudioNow();
  await captureReleasePromise;
  setBrowserAudioSession('play-and-record');
  micStream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  captureContext = new AudioContext({ latencyHint: 'interactive' });
  await captureContext.resume();
  micSource = captureContext.createMediaStreamSource(micStream);
  highPass = captureContext.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 45;
  highPass.Q.value = 0.5;
  analyser = captureContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;
  timeDomain = new Float32Array(analyser.fftSize);
  micSource.connect(highPass);
  highPass.connect(analyser);
  setMicState('live', 'mic live');
}

function resetTake(): void {
  take = [];
  stepBuckets = createStepBuckets();
  stepPreview = Array(STEP_COUNT).fill(null);
  currentStep = -1;
  lastOnsetAt = Number.NEGATIVE_INFINITY;
  lastOnsetStrength = 0;
  velocityTracker.reset();
  onsetTracker.reset();
  noteLabel.textContent = '—';
  noteLabel.classList.add('idle');
  centsLabel.textContent = `CAL +${PITCH_CALIBRATION_SEMITONES}st`;
  velocityLabel.textContent = '—';
  confidenceLabel.textContent = '—';
  levelMeter.style.width = '0%';
  stepReadout.textContent = 'STEP — / 16';
  renderSteps();
}

async function beginCapture(): Promise<void> {
  setError(null);
  clearAuditionTimers();
  recordButton.disabled = true;
  keepButton.textContent = 'Keep → Core';
  try {
    if (productEngine.getLifecycleState() === 'running') await suspendProductCoreForCapture();
    await ensureMicrophone();
  } catch (error) {
    recordButton.disabled = false;
    setBrowserAudioSession('auto');
    setMicState('warn', 'mic unavailable');
    setError(describeError(error));
    return;
  }
  if (!captureContext) return;
  resetTake();
  quarterDuration = 60 / safeBpm();
  stepDuration = quarterDuration / 4;
  recordStartTime = captureContext.currentTime + quarterDuration * 4;
  recordEndTime = recordStartTime + stepDuration * STEP_COUNT;
  lastAnalysisAt = -1;
  phase = 'count-in';
  recordButton.classList.add('recording');
  recordButton.textContent = 'Listening';
  phaseLabel.textContent = 'count in · 4';
  hint.innerHTML = 'After four beats, sing, hum, or use <strong>bum / dung / deng</strong>. Holds remain one note; new attacks retrigger.';
  updateActionVisibility();
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(frame);
}

function frame(): void {
  if (!captureContext) return;
  const now = captureContext.currentTime;
  if (phase === 'count-in') {
    const remaining = Math.max(0, recordStartTime - now);
    const count = Math.max(1, Math.ceil(remaining / quarterDuration));
    phaseLabel.textContent = `count in · ${count}`;
    const beatPhase = ((recordStartTime - now) % quarterDuration + quarterDuration) % quarterDuration;
    pulse.style.opacity = String(Math.max(0, Math.min(1, 0.72 * Math.exp(-beatPhase * 12))));
    if (now >= recordStartTime) {
      phase = 'recording';
      phaseLabel.textContent = 'recording · pitch + onset';
      velocityTracker.reset();
      onsetTracker.reset();
      lastAnalysisAt = -1;
    }
  }
  if (phase === 'recording') {
    const elapsed = Math.max(0, now - recordStartTime);
    currentStep = Math.max(0, Math.min(STEP_COUNT - 1, Math.floor(elapsed / stepDuration)));
    stepReadout.textContent = `STEP ${String(currentStep + 1).padStart(2, '0')} / 16`;
    const stepPhase = (elapsed % stepDuration) / stepDuration;
    pulse.style.opacity = String(Math.max(0, 0.64 * Math.exp(-stepPhase * 5.5)));
    if (lastAnalysisAt < 0 || (now - lastAnalysisAt) * 1000 >= ANALYSIS_INTERVAL_MS) {
      lastAnalysisAt = now;
      analyzeCurrentFrame(currentStep, now);
    }
    renderSteps();
    if (now >= recordEndTime) {
      finishCapture();
      return;
    }
  }
  if (phase === 'count-in' || phase === 'recording') animationFrame = requestAnimationFrame(frame);
}

function analyzeCurrentFrame(step: number, now: number): void {
  if (!analyser || !timeDomain || !captureContext) return;
  analyser.getFloatTimeDomainData(timeDomain);
  const rms = rmsOf(timeDomain);
  const onset = onsetTracker.observe(rms, now * 1000);
  if (onset.onset) {
    lastOnsetAt = now;
    lastOnsetStrength = onset.strength;
    if (stepBuckets[step]) stepBuckets[step]!.onsetStrength = Math.max(stepBuckets[step]!.onsetStrength, onset.strength);
  }
  levelMeter.style.width = `${Math.min(100, rms * 700)}%`;

  const rawObservation = analyzeMonophonicPitch(timeDomain, captureContext.sampleRate, {
    minHz: 55,
    maxHz: 1200,
    minRms: 0.0065,
    minConfidence: 0.5,
  });
  if (!rawObservation) {
    confidenceLabel.textContent = onset.onset ? 'ATTACK' : '—';
    return;
  }

  const observation = calibrateVoicePitchObservation(rawObservation, PITCH_CALIBRATION_SEMITONES);
  if (now - lastOnsetAt <= ONSET_CARRY_SECONDS && stepBuckets[step]) {
    stepBuckets[step]!.onsetStrength = Math.max(stepBuckets[step]!.onsetStrength, lastOnsetStrength);
  }
  const velocity = velocityTracker.observe(rawObservation.rms);
  stepBuckets[step]?.pitches.push(observation);
  stepBuckets[step]?.velocities.push(velocity);
  noteLabel.textContent = midiToNoteName(observation.midi);
  noteLabel.classList.remove('idle');
  centsLabel.textContent = `${observation.cents >= 0 ? '+' : '−'} ${Math.abs(Math.round(observation.cents))}¢`;
  velocityLabel.textContent = String(velocity);
  confidenceLabel.textContent = onset.onset ? `ATT ${Math.round(observation.confidence * 100)}%` : `${Math.round(observation.confidence * 100)}%`;
}

function finishCapture(): void {
  cancelAnimationFrame(animationFrame);
  pulse.style.opacity = '0';
  const expectedFrames = Math.max(1, Math.round((stepDuration * 1000) / ANALYSIS_INTERVAL_MS));
  stepPreview = stepBuckets.map((bucket, step) => aggregateVoiceStep(
    step,
    bucket.pitches,
    bucket.velocities,
    expectedFrames,
    selectedRoot(),
    selectedScale(),
  ));
  take = segmentVoicePhrase(
    stepPreview,
    stepBuckets.map((bucket) => bucket.onsetStrength),
    { onsetThreshold: 0.42, bridgeSingleMissingStep: true },
  );
  phase = 'review';
  currentStep = -1;
  releaseCaptureAudioNow();
  recordButton.disabled = false;
  recordButton.classList.remove('recording');
  recordButton.textContent = 'Enable mic + record';
  const heldCount = take.filter((note) => note.articulation === 'hold').length;
  phaseLabel.textContent = take.length > 0 ? `take · ${take.length} notes / ${heldCount} holds` : 'take · no stable notes';
  stepReadout.textContent = 'PHRASE / 16';
  keepButton.disabled = take.length === 0;
  auditionButton.disabled = take.length === 0;
  hint.innerHTML = take.length > 0
    ? 'Review phrase segmentation. <strong>Horizontal spans are holds; separate blocks are retriggers.</strong> Audition uses Lead 1 · Soft Rhodes.'
    : 'No stable pitched phrase was found. Try <strong>bum, dung, deng, mmm, ah</strong> closer to the phone.';
  updateActionVisibility();
  renderSteps();
  updateDebugPreview();
}

function updateActionVisibility(): void {
  const reviewing = phase === 'review' || phase === 'committed';
  recordActions.classList.toggle('hidden', reviewing);
  reviewActions.classList.toggle('visible', reviewing);
}

function updateDebugPreview(committed = false): void {
  if (take.length === 0) {
    debugBody.textContent = lastCoreError ? `Core error: ${lastCoreError}` : 'No take committed yet.';
    return;
  }
  const commit = createProductVoiceStepCommit(take, TEST_LANE_INDEX, STEP_COUNT);
  debugBody.textContent = JSON.stringify({
    state: committed ? 'ENQUEUED TO PRODUCT CORE' : 'DRAFT — NOT YET ENQUEUED',
    pitchCalibrationSemitones: PITCH_CALIBRATION_SEMITONES,
    testSound: { source: 'lead1', presetId: TEST_PRESET_ID, presetName: 'Soft Rhodes' },
    lifecycle: productEngine.getLifecycleState(),
    coreError: lastCoreError,
    phraseNotes: take,
    onsetStrengthByStep: stepBuckets.map((bucket) => Number(bucket.onsetStrength.toFixed(3))),
    coreLimitation: 'Current synth step contract has no per-note gate/tie field; only onset triggers are committed.',
    nativeEventCount: commit.events.length,
    coreEvents: commit.events,
  }, null, 2);
}

async function commitTake(): Promise<void> {
  if (take.length === 0) return;
  setError(null);
  keepButton.disabled = true;
  releaseCaptureAudioNow();
  primeProductCoreFromGesture();
  if (!await ensureProductCore()) {
    keepButton.disabled = false;
    setError(`Product Core startup failed: ${lastCoreError ?? 'unknown Core error'}`);
    return;
  }
  try {
    const commit = createProductVoiceStepCommit(take, TEST_LANE_INDEX, STEP_COUNT);
    await productEngine.enqueueRealtimeEvents(commit.events);
    phase = 'committed';
    phaseLabel.textContent = 'committed · onset notes / Soft Rhodes';
    keepButton.textContent = 'Kept ✓';
    hint.innerHTML = `<strong>${take.length} phrase onsets</strong> were committed. Held steps are no longer retriggered.`;
    updateDebugPreview(true);
    renderSteps();
  } catch (error) {
    keepButton.disabled = false;
    setError(`Product Core rejected the event batch: ${describeError(error)}`);
  }
}

async function auditionEvent(event: VoicePhraseNote): Promise<void> {
  releaseCaptureAudioNow();
  primeProductCoreFromGesture();
  if (!await ensureProductCore()) {
    setError(`Product Core startup failed: ${lastCoreError ?? 'unknown Core error'}`);
    return;
  }
  await productEngine.auditionSynthNote({
    source: 'lead1',
    midi: event.pitch,
    velocity: event.velocity / 127,
    durationMs: Math.max(90, Math.round(stepDuration * event.durationSteps * 1000)),
  }).catch((error) => setError(`Soft Rhodes audition failed: ${describeError(error)}`));
}

async function auditionTake(): Promise<void> {
  if (take.length === 0) return;
  setError(null);
  clearAuditionTimers();
  releaseCaptureAudioNow();
  primeProductCoreFromGesture();
  if (!await ensureProductCore()) {
    setError(`Product Core startup failed: ${lastCoreError ?? 'unknown Core error'}`);
    return;
  }
  for (const event of take) {
    const timer = window.setTimeout(() => {
      void productEngine.auditionSynthNote({
        source: 'lead1',
        midi: event.pitch,
        velocity: event.velocity / 127,
        durationMs: Math.max(90, Math.round(stepDuration * event.durationSteps * 1000)),
      }).catch((error) => setError(`Soft Rhodes audition failed: ${describeError(error)}`));
    }, Math.round(event.step * stepDuration * 1000));
    auditionTimers.push(timer);
  }
}

function clearAuditionTimers(): void {
  for (const timer of auditionTimers) window.clearTimeout(timer);
  auditionTimers = [];
}

function clearAll(): void {
  clearAuditionTimers();
  cancelAnimationFrame(animationFrame);
  releaseCaptureAudioNow();
  phase = 'idle';
  pulse.style.opacity = '0';
  phaseLabel.textContent = 'ready · one bar / 16 steps';
  hint.innerHTML = 'Use <strong>bum / dung / deng / hum / sustained notes</strong>. Pitch is calibrated +2 semitones for this device test.';
  keepButton.textContent = 'Keep → Core';
  keepButton.disabled = false;
  auditionButton.disabled = false;
  recordButton.disabled = false;
  recordButton.classList.remove('recording');
  recordButton.textContent = 'Enable mic + record';
  setError(null);
  resetTake();
  updateActionVisibility();
  updateDebugPreview();
}

function renderSteps(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssWidth = rect.width;
  const cssHeight = rect.height;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const cream = 'rgba(232,220,196,';
  const ice = 'rgba(184,224,255,';
  const columnWidth = cssWidth / STEP_COUNT;
  const top = 14;
  const bottom = cssHeight - 22;
  const plotHeight = Math.max(20, bottom - top);

  for (let step = 0; step < STEP_COUNT; step += 1) {
    const x = step * columnWidth;
    if (step === currentStep && phase === 'recording') {
      ctx.fillStyle = `${ice}.08)`;
      ctx.fillRect(x + 1, 0, Math.max(1, columnWidth - 2), cssHeight);
    }
    ctx.strokeStyle = step % 4 === 0 ? `${cream}.18)` : `${cream}.075)`;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, cssHeight - 15); ctx.stroke();
    ctx.fillStyle = step % 4 === 0 ? `${cream}.42)` : `${cream}.22)`;
    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.fillText(String(step + 1), x + columnWidth / 2, cssHeight - 3);
  }
  ctx.strokeStyle = `${cream}.12)`;
  ctx.beginPath(); ctx.moveTo(0, bottom + 0.5); ctx.lineTo(cssWidth, bottom + 0.5); ctx.stroke();

  const liveEvents: VoicePhraseNote[] = take.length > 0 ? take : stepBuckets.flatMap((bucket, step) => {
    const frame = bucket.pitches[bucket.pitches.length - 1];
    const velocity = bucket.velocities[bucket.velocities.length - 1];
    return frame && velocity !== undefined ? [{
      step, endStep: step, durationSteps: 1, articulation: 'transient' as const,
      onsetStrength: bucket.onsetStrength, pitch: frame.midi, velocity, gate: 0.5,
      confidence: frame.confidence, cents: frame.cents, frequencyHz: frame.frequencyHz,
    }] : [];
  });
  if (liveEvents.length === 0) return;
  const pitches = liveEvents.map((event) => event.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const centerPitch = (minPitch + maxPitch) / 2;
  const span = Math.max(12, maxPitch - minPitch + 4);
  const plotMin = centerPitch - span / 2;

  for (const event of liveEvents) {
    const x = event.step * columnWidth + 2;
    const normalizedPitch = (event.pitch - plotMin) / span;
    const y = bottom - Math.max(0, Math.min(1, normalizedPitch)) * plotHeight;
    const velocityHeight = 5 + (event.velocity / 127) * 19;
    const blockWidth = Math.max(6, event.durationSteps * columnWidth - 4);
    const confident = event.confidence >= 0.7;
    ctx.strokeStyle = confident ? `${ice}.82)` : `${cream}.46)`;
    ctx.fillStyle = confident ? `${ice}${event.articulation === 'hold' ? '.22)' : '.14)'}` : 'transparent';
    ctx.lineWidth = event.onsetStrength >= 0.42 ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y - velocityHeight / 2, blockWidth, velocityHeight, 2);
    if (confident) ctx.fill();
    ctx.stroke();
    if (take.length > 0) {
      ctx.fillStyle = `${cream}.7)`;
      ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${midiToNoteName(event.pitch)}${event.articulation === 'hold' ? ` ×${event.durationSteps}` : ''}`, x + 2, Math.max(8, y - velocityHeight / 2 - 5));
    }
  }
  if (phase === 'committed') {
    ctx.fillStyle = 'rgba(184,216,175,.7)';
    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right'; ctx.fillText('PRODUCT CORE ✓', cssWidth - 2, 9);
  }
}

function stepFromPointer(event: PointerEvent): number {
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width - 0.01, event.clientX - rect.left));
  return Math.floor((x / rect.width) * STEP_COUNT);
}

laneSelect.innerHTML = '<option value="0">Lead 1 · Soft Rhodes</option>';
laneSelect.value = '0';
laneSelect.disabled = true;
recordButton.addEventListener('click', () => { void beginCapture(); });
clearButton.addEventListener('click', clearAll);
keepButton.addEventListener('click', () => { void commitTake(); });
auditionButton.addEventListener('click', () => { void auditionTake(); });
redoButton.addEventListener('click', () => { phase = 'idle'; updateActionVisibility(); void beginCapture(); });
canvas.addEventListener('pointerdown', (event) => {
  if (phase !== 'review' && phase !== 'committed') return;
  const step = stepFromPointer(event);
  const voiceEvent = take.find((candidate) => step >= candidate.step && step <= candidate.endStep);
  if (voiceEvent) void auditionEvent(voiceEvent);
});
bpmInput.addEventListener('change', () => { quarterDuration = 60 / safeBpm(); stepDuration = quarterDuration / 4; });
window.addEventListener('resize', renderSteps, { passive: true });
window.addEventListener('pagehide', () => { clearAuditionTimers(); cancelAnimationFrame(animationFrame); releaseCaptureAudioNow(); });

setCoreState('cold', 'core cold · Soft Rhodes');
setMicState('idle', 'mic idle');
hint.innerHTML = 'Use <strong>bum / dung / deng / hum / sustained notes</strong>. Holds become one phrase event; attacks retrigger.';
updateActionVisibility();
renderSteps();
updateDebugPreview();
