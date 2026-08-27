import { productEngine } from '../../src/audio/product/ProductEngineProxy';
import {
  DynamicVoiceVelocityTracker,
  aggregateVoiceStep,
  analyzeMonophonicPitch,
  buildVoiceTakeProductCoreCommit,
  midiToNoteName,
  type VoicePitchObservation,
  type VoiceScaleMode,
  type VoiceStepEvent,
} from '../../src/ui/sequencer/voiceStepEntry';

const STEP_COUNT = 16;
const ANALYSIS_INTERVAL_MS = 34;
const FFT_SIZE = 2048;

type CapturePhase = 'idle' | 'count-in' | 'recording' | 'review' | 'committed';

type StepFrameBucket = {
  pitches: VoicePitchObservation[];
  velocities: number[];
};

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

let phase: CapturePhase = 'idle';
let micStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let highPass: BiquadFilterNode | null = null;
let analyser: AnalyserNode | null = null;
let timeDomain: Float32Array | null = null;
let animationFrame = 0;
let recordStartTime = 0;
let recordEndTime = 0;
let quarterDuration = 0.6;
let stepDuration = 0.15;
let currentStep = -1;
let lastAnalysisAt = -1;
let take: VoiceStepEvent[] = [];
let stepBuckets: StepFrameBucket[] = createStepBuckets();
let coreBootPromise: Promise<boolean> | null = null;
let coreReady = false;
let auditionTimers: number[] = [];
const velocityTracker = new DynamicVoiceVelocityTracker();

function createStepBuckets(): StepFrameBucket[] {
  return Array.from({ length: STEP_COUNT }, () => ({ pitches: [], velocities: [] }));
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

function selectedLane(): number {
  return Math.max(0, Math.min(3, Math.round(Number(laneSelect.value) || 0)));
}

function setError(message: string | null): void {
  if (!message) {
    errorBox.textContent = '';
    errorBox.classList.remove('visible');
    return;
  }
  errorBox.textContent = message;
  errorBox.classList.add('visible');
}

function describeError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Microphone permission was denied. Allow microphone access for this site and try again.';
    if (error.name === 'NotFoundError') return 'No microphone input was found on this device.';
    if (error.name === 'NotReadableError') return 'The microphone is busy or unavailable to the browser.';
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

function primeProductCoreFromGesture(): void {
  try {
    productEngine.primeAudioContext();
  } catch (error) {
    setCoreState('warn', 'core prime failed');
    console.warn('[voice-step-entry] Product Core prime failed', error);
  }
}

async function ensureProductCore(): Promise<boolean> {
  if (coreReady && productEngine.getLifecycleState() === 'running') return true;
  if (coreBootPromise) return coreBootPromise;
  coreBootPromise = (async () => {
    try {
      setCoreState('starting', 'core starting');
      await productEngine.preload();
      const lifecycle = productEngine.getLifecycleState();
      if (lifecycle !== 'running') await productEngine.start();
      coreReady = productEngine.getLifecycleState() === 'running';
      setCoreState(coreReady ? 'live' : 'warn', coreReady ? 'core live' : `core ${productEngine.getLifecycleState()}`);
      return coreReady;
    } catch (error) {
      coreReady = false;
      setCoreState('warn', 'core unavailable');
      console.warn('[voice-step-entry] Product Core boot failed', error);
      return false;
    } finally {
      coreBootPromise = null;
    }
  })();
  return coreBootPromise;
}

async function ensureMicrophone(): Promise<void> {
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    throw new Error('Mobile browsers require HTTPS for microphone input. Open this prototype on an HTTPS preview URL.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not expose getUserMedia(). Use current Safari or Chrome over HTTPS.');
  }

  const AudioContextClass = window.AudioContext;
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContextClass({ latencyHint: 'interactive' });
  }
  await audioContext.resume();

  stopMicrophoneTracks();
  micStream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });

  micSource?.disconnect();
  highPass?.disconnect();
  analyser?.disconnect();

  micSource = audioContext.createMediaStreamSource(micStream);
  highPass = audioContext.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 55;
  highPass.Q.value = 0.55;

  analyser = audioContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;
  timeDomain = new Float32Array(analyser.fftSize);

  micSource.connect(highPass);
  highPass.connect(analyser);
  setMicState('live', 'mic live');
}

function stopMicrophoneTracks(): void {
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop();
    micStream = null;
  }
  setMicState('idle', 'mic idle');
}

function resetTake(): void {
  take = [];
  stepBuckets = createStepBuckets();
  currentStep = -1;
  velocityTracker.reset();
  noteLabel.textContent = '—';
  noteLabel.classList.add('idle');
  centsLabel.textContent = '± 0¢';
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
  primeProductCoreFromGesture();
  void ensureProductCore();

  try {
    await ensureMicrophone();
  } catch (error) {
    recordButton.disabled = false;
    setMicState('warn', 'mic unavailable');
    setError(describeError(error));
    return;
  }

  if (!audioContext) return;
  resetTake();
  const bpm = safeBpm();
  quarterDuration = 60 / bpm;
  stepDuration = quarterDuration / 4;
  const countInDuration = quarterDuration * 4;
  recordStartTime = audioContext.currentTime + countInDuration;
  recordEndTime = recordStartTime + stepDuration * STEP_COUNT;
  lastAnalysisAt = -1;
  phase = 'count-in';
  recordButton.classList.add('recording');
  recordButton.textContent = 'Listening';
  hint.innerHTML = 'Follow the full-screen pulse. <strong>Recording begins after four beats.</strong> Hum one monophonic phrase.';
  updateActionVisibility();
  startAnimationLoop();
}

function startAnimationLoop(): void {
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(frame);
}

function frame(): void {
  if (!audioContext) return;
  const now = audioContext.currentTime;

  if (phase === 'count-in') {
    const remaining = Math.max(0, recordStartTime - now);
    const count = Math.max(1, Math.ceil(remaining / quarterDuration));
    phaseLabel.textContent = `count in · ${count}`;
    const beatPhase = ((recordStartTime - now) % quarterDuration + quarterDuration) % quarterDuration;
    pulse.style.opacity = String(Math.max(0, Math.min(1, 0.72 * Math.exp(-beatPhase * 12))));
    if (now >= recordStartTime) {
      phase = 'recording';
      phaseLabel.textContent = 'recording · sing / hum';
      velocityTracker.reset();
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
      analyzeCurrentFrame(currentStep);
    }
    renderSteps();

    if (now >= recordEndTime) {
      finishCapture();
      return;
    }
  }

  if (phase === 'count-in' || phase === 'recording') {
    animationFrame = requestAnimationFrame(frame);
  }
}

function analyzeCurrentFrame(step: number): void {
  if (!analyser || !timeDomain || !audioContext) return;
  analyser.getFloatTimeDomainData(timeDomain);
  const observation = analyzeMonophonicPitch(timeDomain, audioContext.sampleRate, {
    minHz: 70,
    maxHz: 1000,
    minRms: 0.009,
    minConfidence: 0.58,
  });

  if (!observation) {
    // Give the meter a useful silence response without promoting noise to notes.
    let energy = 0;
    for (let index = 0; index < timeDomain.length; index += 1) {
      const value = timeDomain[index] ?? 0;
      energy += value * value;
    }
    const rms = Math.sqrt(energy / timeDomain.length);
    levelMeter.style.width = `${Math.min(100, rms * 700)}%`;
    confidenceLabel.textContent = '—';
    return;
  }

  const velocity = velocityTracker.observe(observation.rms);
  const bucket = stepBuckets[step];
  bucket?.pitches.push(observation);
  bucket?.velocities.push(velocity);

  noteLabel.textContent = midiToNoteName(observation.midi);
  noteLabel.classList.remove('idle');
  centsLabel.textContent = `${observation.cents >= 0 ? '+' : '−'} ${Math.abs(Math.round(observation.cents))}¢`;
  velocityLabel.textContent = String(velocity);
  confidenceLabel.textContent = `${Math.round(observation.confidence * 100)}%`;
  levelMeter.style.width = `${Math.max(2, Math.min(100, observation.rms * 650))}%`;
}

function finishCapture(): void {
  cancelAnimationFrame(animationFrame);
  pulse.style.opacity = '0';
  const expectedFrameCount = Math.max(1, Math.round((stepDuration * 1000) / ANALYSIS_INTERVAL_MS));
  take = stepBuckets.flatMap((bucket, step) => {
    const event = aggregateVoiceStep(
      step,
      bucket.pitches,
      bucket.velocities,
      expectedFrameCount,
      selectedRoot(),
      selectedScale(),
    );
    return event ? [event] : [];
  });

  phase = 'review';
  currentStep = -1;
  stopMicrophoneTracks();
  recordButton.disabled = false;
  recordButton.classList.remove('recording');
  recordButton.textContent = 'Enable mic + record';
  phaseLabel.textContent = take.length > 0 ? `take · ${take.length} notes` : 'take · no stable notes';
  stepReadout.textContent = 'TAKE / 16';
  keepButton.disabled = take.length === 0;
  auditionButton.disabled = take.length === 0;
  hint.innerHTML = take.length > 0
    ? 'Review the detected phrase. <strong>Keep</strong> converts it to native Product Core synth-lane events; tap a note column to audition it.'
    : 'No stable pitched steps were detected. Try again with a steady <strong>“mmm” or “ah”</strong>, closer to the phone.';
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
    debugBody.textContent = 'No take committed yet.';
    return;
  }
  const commit = buildVoiceTakeProductCoreCommit(take, selectedLane(), STEP_COUNT);
  const summary = {
    state: committed ? 'ENQUEUED TO PRODUCT CORE' : 'DRAFT — NOT YET ENQUEUED',
    lane: commit.laneIndex,
    noteCount: take.length,
    nativeEventCount: commit.events.length,
    take,
    coreOverrides: commit.overrides,
    coreEvents: commit.events,
  };
  try {
    debugBody.textContent = JSON.stringify(summary, null, 2);
  } catch {
    debugBody.textContent = `${summary.state}\nlane ${summary.lane + 1}\n${summary.nativeEventCount} Product Core events`;
  }
}

async function commitTake(): Promise<void> {
  if (take.length === 0) return;
  setError(null);
  keepButton.disabled = true;
  primeProductCoreFromGesture();
  const ready = await ensureProductCore();
  if (!ready) {
    keepButton.disabled = false;
    setError('The voice take is valid, but Product Core could not start in this standalone prototype. Open the event debug section to inspect the exact generated Core payload.');
    return;
  }

  const commit = buildVoiceTakeProductCoreCommit(take, selectedLane(), STEP_COUNT);
  try {
    await productEngine.enqueueRealtimeEvents(commit.events);
    phase = 'committed';
    phaseLabel.textContent = `committed · core lane ${commit.laneIndex + 1}`;
    keepButton.textContent = 'Kept ✓';
    hint.innerHTML = `<strong>${commit.events.length} native Product Core events</strong> were enqueued for synth lane ${commit.laneIndex + 1}. Redo records a replacement take.`;
    updateDebugPreview(true);
    renderSteps();
  } catch (error) {
    keepButton.disabled = false;
    setError(`Product Core rejected the event batch: ${describeError(error)}`);
  }
}

async function auditionEvent(event: VoiceStepEvent): Promise<void> {
  primeProductCoreFromGesture();
  if (!(await ensureProductCore())) {
    setError('Product Core is unavailable, so note audition cannot run. Voice analysis and Core event generation still work.');
    return;
  }
  try {
    await productEngine.auditionSynthNote({
      source: selectedLane() === 1 ? 'lead2' : 'lead1',
      midi: event.pitch,
      velocity: event.velocity / 127,
      durationMs: Math.max(70, Math.round(stepDuration * event.gate * 1000)),
    });
  } catch (error) {
    setError(`Audition failed: ${describeError(error)}`);
  }
}

async function auditionTake(): Promise<void> {
  if (take.length === 0) return;
  setError(null);
  clearAuditionTimers();
  primeProductCoreFromGesture();
  if (!(await ensureProductCore())) {
    setError('Product Core is unavailable, so take audition cannot run.');
    return;
  }
  const ordered = [...take].sort((a, b) => a.step - b.step);
  for (const event of ordered) {
    const timer = window.setTimeout(() => {
      void auditionEvent(event);
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
  stopMicrophoneTracks();
  phase = 'idle';
  pulse.style.opacity = '0';
  phaseLabel.textContent = 'ready · one bar / 16 steps';
  hint.innerHTML = 'Tap record, then hum or sing <strong>one monophonic phrase</strong>. There is a four-beat count-in, then Kesshō captures one 16-step bar.';
  keepButton.textContent = 'Keep → Core';
  keepButton.disabled = false;
  auditionButton.disabled = false;
  recordButton.disabled = false;
  recordButton.classList.remove('recording');
  recordButton.textContent = 'Enable mic + record';
  setError(null);
  resetTake();
  updateActionVisibility();
  debugBody.textContent = 'No take committed yet.';
}

function renderSteps(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
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
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, cssHeight - 15);
    ctx.stroke();
    ctx.fillStyle = step % 4 === 0 ? `${cream}.42)` : `${cream}.22)`;
    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(step + 1), x + columnWidth / 2, cssHeight - 3);
  }
  ctx.strokeStyle = `${cream}.12)`;
  ctx.beginPath();
  ctx.moveTo(0, bottom + 0.5);
  ctx.lineTo(cssWidth, bottom + 0.5);
  ctx.stroke();

  const visibleEvents = take.length > 0
    ? take
    : stepBuckets.flatMap((bucket, step) => {
        const frame = bucket.pitches[bucket.pitches.length - 1];
        const velocity = bucket.velocities[bucket.velocities.length - 1];
        if (!frame || velocity === undefined) return [];
        return [{
          step,
          pitch: frame.midi,
          velocity,
          gate: 0.5,
          confidence: frame.confidence,
          cents: frame.cents,
          frequencyHz: frame.frequencyHz,
        } satisfies VoiceStepEvent];
      });

  if (visibleEvents.length === 0) return;
  const pitches = visibleEvents.map((event) => event.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const centerPitch = (minPitch + maxPitch) / 2;
  const span = Math.max(12, maxPitch - minPitch + 4);
  const plotMin = centerPitch - span / 2;

  for (const event of visibleEvents) {
    const x = event.step * columnWidth + columnWidth / 2;
    const normalizedPitch = (event.pitch - plotMin) / span;
    const y = bottom - Math.max(0, Math.min(1, normalizedPitch)) * plotHeight;
    const velocityHeight = 5 + (event.velocity / 127) * 19;
    const confident = event.confidence >= 0.72;

    ctx.strokeStyle = confident ? `${ice}.82)` : `${cream}.46)`;
    ctx.fillStyle = confident ? `${ice}.19)` : 'transparent';
    ctx.lineWidth = confident ? 1.5 : 1;
    ctx.beginPath();
    ctx.rect(x - Math.max(3, columnWidth * 0.24), y - velocityHeight / 2, Math.max(6, columnWidth * 0.48), velocityHeight);
    if (confident) ctx.fill();
    ctx.stroke();

    if (take.length > 0) {
      ctx.fillStyle = `${cream}.64)`;
      ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(midiToNoteName(event.pitch), x, Math.max(8, y - velocityHeight / 2 - 5));
    }
  }

  if (phase === 'committed') {
    ctx.fillStyle = 'rgba(184,216,175,.7)';
    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('PRODUCT CORE ✓', cssWidth - 2, 9);
  }
}

function stepFromPointer(event: PointerEvent): number {
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width - 0.01, event.clientX - rect.left));
  return Math.floor((x / rect.width) * STEP_COUNT);
}

recordButton.addEventListener('click', () => { void beginCapture(); });
clearButton.addEventListener('click', clearAll);
keepButton.addEventListener('click', () => { void commitTake(); });
auditionButton.addEventListener('click', () => { void auditionTake(); });
redoButton.addEventListener('click', () => {
  keepButton.textContent = 'Keep → Core';
  phase = 'idle';
  updateActionVisibility();
  void beginCapture();
});

canvas.addEventListener('pointerdown', (event) => {
  if (phase !== 'review' && phase !== 'committed') return;
  const step = stepFromPointer(event);
  const voiceEvent = take.find((candidate) => candidate.step === step);
  if (voiceEvent) void auditionEvent(voiceEvent);
});

for (const input of [laneSelect, rootSelect, scaleSelect]) {
  input.addEventListener('change', () => {
    if (take.length > 0) updateDebugPreview(phase === 'committed');
  });
}

bpmInput.addEventListener('change', () => {
  const bpm = safeBpm();
  quarterDuration = 60 / bpm;
  stepDuration = quarterDuration / 4;
});

window.addEventListener('resize', renderSteps, { passive: true });
window.addEventListener('pagehide', () => {
  clearAuditionTimers();
  stopMicrophoneTracks();
  cancelAnimationFrame(animationFrame);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (phase === 'count-in' || phase === 'recording')) {
    setError('Recording was interrupted because the page left the foreground. Redo the take.');
  }
});

setCoreState('cold', 'core cold');
setMicState('idle', 'mic idle');
updateActionVisibility();
renderSteps();
