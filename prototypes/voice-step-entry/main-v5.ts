import { productEngine } from '../../src/audio/product/ProductEngineProxy';
import { createProductVoiceStepCommit } from '../../src/audio/product/ProductVoiceStepEntryEvents';
import lead4opfmV2PresetBank from '../../src/audio/lead4opfmV2PresetBank.json';
import {
  analyzeMonophonicPitch,
  midiToNoteName,
  type VoiceScaleMode,
} from '../../src/ui/sequencer/voiceStepEntry';
import {
  VoiceAlgorithmSession,
  VOICE_ALGORITHM_LABELS,
  type VoiceAlgorithmId,
  type VoiceAlgorithmResult,
} from '../../src/ui/sequencer/voiceAlgorithmWorkbench';
import type { VoicePhraseNote } from '../../src/ui/sequencer/voicePhraseInterpreter';

const STEP_COUNT = 16;
const TEST_PRESET_ID = 'soft_rhodes';
const TEST_LANE_INDEX = 0;
const AUDITION_TRANSPOSE_SEMITONES = 12;
const DEFAULT_CALIBRATION_SEMITONES = 1;
const ALGORITHMS: VoiceAlgorithmId[] = ['basic-pitch', 'basic-pitch-pitchy', 'crepe', 'pyin', 'pitchy'];

type CapturePhase = 'idle' | 'count-in' | 'recording' | 'review' | 'committed';
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
let recorderNode: ScriptProcessorNode | null = null;
let mutedCaptureGain: GainNode | null = null;
let timeDomain: Float32Array | null = null;
let captureReleasePromise: Promise<void> = Promise.resolve();
let pcmChunks: Float32Array[] = [];
let capturedPcm: Float32Array | null = null;
let capturedSampleRate = 0;
let algorithmSession: VoiceAlgorithmSession | null = null;
let animationFrame = 0;
let recordStartTime = 0;
let recordEndTime = 0;
let quarterDuration = 0.6;
let stepDuration = 0.15;
let currentStep = -1;
let lastMonitorAt = -1;
let coreBootPromise: Promise<boolean> | null = null;
let coreReady = false;
let lastCoreError: string | null = null;
let auditionTimers: number[] = [];
let analysisRunning = false;
const results = new Map<VoiceAlgorithmId, VoiceAlgorithmResult>();
const enabledAlgorithms = new Set<VoiceAlgorithmId>(ALGORITHMS);
let activeAlgorithm: VoiceAlgorithmId = 'basic-pitch';

function injectAlgorithmBench(): void {
  const style = document.createElement('style');
  style.textContent = `
    .algo-bench{border-bottom:1px solid var(--cream-10);padding:11px 0 12px}.algo-head{display:flex;align-items:center;gap:8px;margin-bottom:9px}.algo-title{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--cream-42)}.algo-head button{margin-left:auto;min-height:31px;padding:0 9px;font-size:8px}.algo-cal{display:flex;align-items:center;gap:5px;color:var(--cream-42);font-size:8px}.algo-cal select{width:54px;min-height:27px}.algo-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}.algo-card{min-width:0;border:1px solid var(--cream-10);padding:7px 5px;background:transparent;color:var(--cream-42);text-align:left;min-height:70px}.algo-card.active{border-color:var(--ice);background:rgba(184,224,255,.06)}.algo-card.failed{border-color:rgba(216,143,104,.45)}.algo-card label{display:flex;align-items:center;gap:4px;font-size:7px;line-height:1.2;color:var(--cream-70);cursor:pointer}.algo-card input{width:11px;height:11px;margin:0}.algo-state{display:block;margin-top:6px;font-size:7px;line-height:1.3;white-space:normal;color:var(--cream-42)}.algo-notes{display:block;margin-top:3px;font-size:7px;line-height:1.25;color:rgba(232,220,196,.58);white-space:normal}.algo-progress{height:1px;background:var(--cream-10);margin-top:5px;overflow:hidden}.algo-progress i{display:block;height:100%;width:0;background:var(--ice)}@media(max-width:480px){.algo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.algo-card:last-child{grid-column:span 2}.algo-head{flex-wrap:wrap}.algo-head button{margin-left:0}}
  `;
  document.head.appendChild(style);

  const section = document.createElement('section');
  section.className = 'algo-bench';
  section.innerHTML = `
    <div class="algo-head">
      <span class="algo-title">detection algorithms · same recorded take</span>
      <span class="algo-cal">CAL <select id="algoCalibration"><option value="0">0 st</option><option value="1" selected>+1 st</option><option value="2">+2 st</option><option value="-1">−1 st</option><option value="-2">−2 st</option></select></span>
      <button id="analyzeAlgorithms" disabled>Analyze enabled</button>
    </div>
    <div id="algorithmGrid" class="algo-grid"></div>`;
  const controls = document.querySelector('.controls');
  controls?.insertAdjacentElement('afterend', section);

  const grid = required<HTMLDivElement>('algorithmGrid');
  for (const id of ALGORITHMS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'algo-card';
    card.dataset.algorithm = id;
    card.innerHTML = `<label><input type="checkbox" checked data-enable="${id}"/><span>${VOICE_ALGORITHM_LABELS[id]}</span></label><span class="algo-state" data-state="${id}">not analyzed</span><span class="algo-notes" data-notes="${id}">—</span><span class="algo-progress"><i data-progress="${id}"></i></span>`;
    grid.appendChild(card);
  }

  grid.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const checkbox = target.closest('input[data-enable]') as HTMLInputElement | null;
    if (checkbox) {
      const id = checkbox.dataset.enable as VoiceAlgorithmId;
      if (checkbox.checked) enabledAlgorithms.add(id); else enabledAlgorithms.delete(id);
      event.stopPropagation();
      return;
    }
    const card = target.closest<HTMLElement>('[data-algorithm]');
    if (!card) return;
    const id = card.dataset.algorithm as VoiceAlgorithmId;
    if (!results.has(id)) return;
    activeAlgorithm = id;
    phase = phase === 'committed' ? 'review' : phase;
    keepButton.textContent = 'Keep → Core';
    renderAlgorithmBench();
    renderSteps();
    updateReviewForActive();
  });

  required<HTMLButtonElement>('analyzeAlgorithms').addEventListener('click', () => { void analyzeEnabledAlgorithms(); });
  required<HTMLSelectElement>('algoCalibration').addEventListener('change', markResultsStale);
  rootSelect.addEventListener('change', markResultsStale);
  scaleSelect.addEventListener('change', markResultsStale);
}

function browserAudioSession(): BrowserAudioSession | null {
  return (navigator as NavigatorWithAudioSession).audioSession ?? null;
}

function setBrowserAudioSession(type: BrowserAudioSession['type']): void {
  const session = browserAudioSession();
  if (!session) return;
  try { session.type = type; } catch (error) {
    console.warn(`[voice-algorithm-bench] unable to set audio session to ${type}`, error);
  }
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

function calibrationSemitones(): number {
  return Math.max(-2, Math.min(2, Number(required<HTMLSelectElement>('algoCalibration').value) || DEFAULT_CALIBRATION_SEMITONES));
}

function setError(message: string | null): void {
  errorBox.textContent = message ?? '';
  errorBox.classList.toggle('visible', Boolean(message));
}

function describeError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Microphone permission was denied. Allow microphone access and try again.';
    if (error.name === 'NotFoundError') return 'No microphone input was found.';
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

function concatenatePcm(chunks: readonly Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
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
  try { recorderNode?.disconnect(); } catch {}
  try { mutedCaptureGain?.disconnect(); } catch {}
  if (recorderNode) recorderNode.onaudioprocess = null;
  micSource = null;
  highPass = null;
  analyser = null;
  recorderNode = null;
  mutedCaptureGain = null;
  timeDomain = null;
  setBrowserAudioSession('auto');
  const context = captureContext;
  captureContext = null;
  if (!context || context.state === 'closed') return Promise.resolve();
  return context.close().catch((error) => console.warn('[voice-algorithm-bench] capture context close failed', error));
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
      return false;
    } finally {
      coreBootPromise = null;
      updateDebugPreview();
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
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') throw new Error('HTTPS is required for microphone input.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not expose getUserMedia().');

  // Preserve first-tap user activation on iOS: do not await anything before
  // getUserMedia unless an older capture graph actually exists.
  if (captureContext || micStream) {
    releaseCaptureAudioNow();
    await captureReleasePromise;
  }
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
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  timeDomain = new Float32Array(analyser.fftSize);

  // Prototype-only PCM tap: one contiguous recording is shared by all five
  // algorithms. The zero-gain destination keeps ScriptProcessor alive without
  // audible mic monitoring.
  recorderNode = captureContext.createScriptProcessor(2048, 1, 1);
  mutedCaptureGain = captureContext.createGain();
  mutedCaptureGain.gain.value = 0;
  recorderNode.onaudioprocess = (event) => {
    if (phase !== 'recording') return;
    pcmChunks.push(event.inputBuffer.getChannelData(0).slice());
  };
  micSource.connect(highPass);
  highPass.connect(analyser);
  highPass.connect(recorderNode);
  recorderNode.connect(mutedCaptureGain);
  mutedCaptureGain.connect(captureContext.destination);
  setMicState('live', 'mic live · PCM armed');
}

function resetCaptureState(): void {
  pcmChunks = [];
  capturedPcm = null;
  capturedSampleRate = 0;
  algorithmSession = null;
  results.clear();
  currentStep = -1;
  lastMonitorAt = -1;
  noteLabel.textContent = '—';
  noteLabel.classList.add('idle');
  centsLabel.textContent = 'MONITOR';
  velocityLabel.textContent = '—';
  confidenceLabel.textContent = '—';
  levelMeter.style.width = '0%';
  stepReadout.textContent = 'STEP — / 16';
  keepButton.disabled = true;
  auditionButton.disabled = true;
  required<HTMLButtonElement>('analyzeAlgorithms').disabled = true;
  renderAlgorithmBench();
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
  resetCaptureState();
  quarterDuration = 60 / safeBpm();
  stepDuration = quarterDuration / 4;
  recordStartTime = captureContext.currentTime + quarterDuration * 4;
  recordEndTime = recordStartTime + stepDuration * STEP_COUNT;
  phase = 'count-in';
  recordButton.classList.add('recording');
  recordButton.textContent = 'Listening';
  phaseLabel.textContent = 'count in · 4';
  hint.innerHTML = 'One raw take will be shared by <strong>all five algorithms</strong>. Use hum, held notes, or bum / dung / deng.';
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
      phaseLabel.textContent = 'recording · shared PCM';
      pcmChunks = [];
      lastMonitorAt = -1;
    }
  }
  if (phase === 'recording') {
    const elapsed = Math.max(0, now - recordStartTime);
    currentStep = Math.max(0, Math.min(STEP_COUNT - 1, Math.floor(elapsed / stepDuration)));
    stepReadout.textContent = `STEP ${String(currentStep + 1).padStart(2, '0')} / 16`;
    const stepPhase = (elapsed % stepDuration) / stepDuration;
    pulse.style.opacity = String(Math.max(0, 0.64 * Math.exp(-stepPhase * 5.5)));
    if (lastMonitorAt < 0 || (now - lastMonitorAt) >= 0.07) {
      lastMonitorAt = now;
      updateLiveMonitor();
    }
    renderSteps();
    if (now >= recordEndTime) {
      finishCapture();
      return;
    }
  }
  if (phase === 'count-in' || phase === 'recording') animationFrame = requestAnimationFrame(frame);
}

function updateLiveMonitor(): void {
  if (!analyser || !timeDomain || !captureContext) return;
  analyser.getFloatTimeDomainData(timeDomain);
  let energy = 0;
  for (const value of timeDomain) energy += value * value;
  const currentRms = Math.sqrt(energy / timeDomain.length);
  levelMeter.style.width = `${Math.min(100, currentRms * 700)}%`;
  const observation = analyzeMonophonicPitch(timeDomain, captureContext.sampleRate, {
    minHz: 55, maxHz: 1200, minRms: 0.008, minConfidence: 0.62,
  });
  if (!observation) {
    confidenceLabel.textContent = '—';
    return;
  }
  noteLabel.textContent = midiToNoteName(Math.round(observation.midiFloat + calibrationSemitones()));
  noteLabel.classList.remove('idle');
  confidenceLabel.textContent = `${Math.round(observation.confidence * 100)}%`;
  velocityLabel.textContent = 'MON';
  centsLabel.textContent = 'LIVE ONLY';
}

function finishCapture(): void {
  cancelAnimationFrame(animationFrame);
  pulse.style.opacity = '0';
  capturedSampleRate = captureContext?.sampleRate ?? 0;
  capturedPcm = concatenatePcm(pcmChunks);
  phase = 'review';
  currentStep = -1;
  releaseCaptureAudioNow();
  recordButton.disabled = false;
  recordButton.classList.remove('recording');
  recordButton.textContent = 'Enable mic + record';
  phaseLabel.textContent = `take captured · ${(capturedPcm.length / Math.max(1, capturedSampleRate)).toFixed(2)}s`;
  stepReadout.textContent = 'RAW TAKE / 16';
  if (capturedPcm.length < 1024 || capturedSampleRate <= 0) {
    setError('The PCM recorder did not capture enough audio. Redo the take.');
    return;
  }
  algorithmSession = new VoiceAlgorithmSession(capturedPcm, capturedSampleRate);
  required<HTMLButtonElement>('analyzeAlgorithms').disabled = false;
  hint.innerHTML = 'Raw take captured. <strong>Toggle algorithms, then Analyze enabled.</strong> Tap a completed card to make it authoritative for audition / Keep.';
  updateActionVisibility();
  renderAlgorithmBench();
  renderSteps();
  updateDebugPreview();
}

function updateActionVisibility(): void {
  const reviewing = phase === 'review' || phase === 'committed';
  recordActions.classList.toggle('hidden', reviewing);
  reviewActions.classList.toggle('visible', reviewing);
}

function markResultsStale(): void {
  if (results.size === 0 || analysisRunning) return;
  for (const id of results.keys()) {
    const state = document.querySelector<HTMLElement>(`[data-state="${id}"]`);
    if (state) state.textContent = 'settings changed · re-analyze';
  }
}

async function analyzeEnabledAlgorithms(): Promise<void> {
  if (!algorithmSession || analysisRunning) return;
  const requested = ALGORITHMS.filter((id) => enabledAlgorithms.has(id));
  if (requested.length === 0) {
    setError('Enable at least one algorithm.');
    return;
  }
  setError(null);
  analysisRunning = true;
  const analyzeButton = required<HTMLButtonElement>('analyzeAlgorithms');
  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Analyzing…';
  keepButton.disabled = true;
  auditionButton.disabled = true;

  for (const id of requested) {
    const state = document.querySelector<HTMLElement>(`[data-state="${id}"]`);
    const progress = document.querySelector<HTMLElement>(`[data-progress="${id}"]`);
    state?.closest('.algo-card')?.classList.remove('failed');
    if (state) state.textContent = 'loading…';
    if (progress) progress.style.width = '2%';
    try {
      const result = await algorithmSession.run(id, {
        stepDurationSeconds: stepDuration,
        stepCount: STEP_COUNT,
        calibrationSemitones: calibrationSemitones(),
        rootPitchClass: selectedRoot(),
        scaleMode: selectedScale(),
        onProgress: (amount, label) => {
          if (progress) progress.style.width = `${Math.round(amount * 100)}%`;
          if (state) state.textContent = `${label} · ${Math.round(amount * 100)}%`;
        },
      });
      results.set(id, result);
      if (state) state.textContent = `${result.notes.length} notes · ${Math.round(result.elapsedMs)} ms`;
      if (progress) progress.style.width = '100%';
      if (result.notes.length > 0 && (!results.has(activeAlgorithm) || activeAlgorithm === id)) activeAlgorithm = id;
    } catch (error) {
      results.delete(id);
      if (state) state.textContent = `failed · ${describeError(error)}`;
      if (progress) progress.style.width = '0%';
      state?.closest('.algo-card')?.classList.add('failed');
      console.error(`[voice-algorithm-bench] ${id} failed`, error);
    }
    renderAlgorithmBench();
  }

  const firstSuccessful = requested.find((id) => (results.get(id)?.notes.length ?? 0) > 0);
  if (firstSuccessful && (results.get(activeAlgorithm)?.notes.length ?? 0) === 0) activeAlgorithm = firstSuccessful;
  analysisRunning = false;
  analyzeButton.disabled = false;
  analyzeButton.textContent = 'Analyze enabled';
  updateReviewForActive();
  renderAlgorithmBench();
  renderSteps();
  updateDebugPreview();
}

function activeResult(): VoiceAlgorithmResult | null {
  return results.get(activeAlgorithm) ?? null;
}

function updateReviewForActive(): void {
  const result = activeResult();
  const hasNotes = Boolean(result?.notes.length);
  keepButton.disabled = !hasNotes || analysisRunning;
  auditionButton.disabled = !hasNotes || analysisRunning;
  if (!result) return;
  phaseLabel.textContent = `${VOICE_ALGORITHM_LABELS[activeAlgorithm]} · ${result.notes.length} notes`;
  stepReadout.textContent = `${VOICE_ALGORITHM_LABELS[activeAlgorithm].toUpperCase()} / 16`;
  hint.innerHTML = `<strong>${VOICE_ALGORITHM_LABELS[activeAlgorithm]}</strong> is authoritative. Audition = Soft Rhodes +1 octave. Keep commits this algorithm's onset notes.`;
}

function notesSummary(notes: readonly VoicePhraseNote[]): string {
  if (notes.length === 0) return 'no notes';
  return notes.slice(0, 7).map((note) => `${midiToNoteName(note.pitch)}${note.durationSteps > 1 ? `×${note.durationSteps}` : ''}`).join(' · ') + (notes.length > 7 ? ' …' : '');
}

function renderAlgorithmBench(): void {
  for (const id of ALGORITHMS) {
    const card = document.querySelector<HTMLElement>(`[data-algorithm="${id}"]`);
    const noteNode = document.querySelector<HTMLElement>(`[data-notes="${id}"]`);
    const result = results.get(id);
    card?.classList.toggle('active', id === activeAlgorithm && Boolean(result));
    if (noteNode) noteNode.textContent = result ? notesSummary(result.notes) : '—';
  }
}

function transposeForAudition(midi: number): number {
  return Math.max(0, Math.min(127, Math.round(midi + AUDITION_TRANSPOSE_SEMITONES)));
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
    midi: transposeForAudition(event.pitch),
    velocity: event.velocity / 127,
    durationMs: Math.max(90, Math.round(stepDuration * event.durationSteps * 1000)),
  }).catch((error) => setError(`Soft Rhodes audition failed: ${describeError(error)}`));
}

async function auditionTake(): Promise<void> {
  const result = activeResult();
  if (!result?.notes.length) return;
  setError(null);
  clearAuditionTimers();
  releaseCaptureAudioNow();
  primeProductCoreFromGesture();
  if (!await ensureProductCore()) {
    setError(`Product Core startup failed: ${lastCoreError ?? 'unknown Core error'}`);
    return;
  }
  for (const event of result.notes) {
    const timer = window.setTimeout(() => {
      void productEngine.auditionSynthNote({
        source: 'lead1',
        midi: transposeForAudition(event.pitch),
        velocity: event.velocity / 127,
        durationMs: Math.max(90, Math.round(stepDuration * event.durationSteps * 1000)),
      }).catch((error) => setError(`Soft Rhodes audition failed: ${describeError(error)}`));
    }, Math.round(event.step * stepDuration * 1000));
    auditionTimers.push(timer);
  }
}

async function commitTake(): Promise<void> {
  const result = activeResult();
  if (!result?.notes.length) return;
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
    const commit = createProductVoiceStepCommit(result.notes, TEST_LANE_INDEX, STEP_COUNT);
    await productEngine.enqueueRealtimeEvents(commit.events);
    phase = 'committed';
    keepButton.textContent = 'Kept ✓';
    phaseLabel.textContent = `committed · ${VOICE_ALGORITHM_LABELS[activeAlgorithm]}`;
    hint.innerHTML = `<strong>${VOICE_ALGORITHM_LABELS[activeAlgorithm]}</strong> committed ${result.notes.length} onset notes to Product Core. Exact hold duration remains audition metadata until Core gains gate/tie.`;
    updateDebugPreview(true);
    renderSteps();
  } catch (error) {
    keepButton.disabled = false;
    setError(`Product Core rejected the event batch: ${describeError(error)}`);
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
  hint.innerHTML = 'Record once, then compare <strong>Basic Pitch · Basic+Pitchy · CREPE · pYIN · Pitchy</strong> on the same PCM.';
  keepButton.textContent = 'Keep → Core';
  recordButton.disabled = false;
  recordButton.classList.remove('recording');
  recordButton.textContent = 'Enable mic + record';
  setError(null);
  resetCaptureState();
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

  const notes = activeResult()?.notes ?? [];
  if (notes.length === 0) return;
  const pitches = notes.map((event) => event.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const centerPitch = (minPitch + maxPitch) / 2;
  const span = Math.max(12, maxPitch - minPitch + 4);
  const plotMin = centerPitch - span / 2;

  for (const event of notes) {
    const x = event.step * columnWidth + 2;
    const normalizedPitch = (event.pitch - plotMin) / span;
    const y = bottom - Math.max(0, Math.min(1, normalizedPitch)) * plotHeight;
    const velocityHeight = 5 + (event.velocity / 127) * 19;
    const blockWidth = Math.max(6, event.durationSteps * columnWidth - 4);
    const confident = event.confidence >= 0.65;
    ctx.strokeStyle = confident ? `${ice}.82)` : `${cream}.46)`;
    ctx.fillStyle = confident ? `${ice}${event.durationSteps > 1 ? '.22)' : '.14)'}` : 'transparent';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y - velocityHeight / 2, blockWidth, velocityHeight, 2);
    if (confident) ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `${cream}.7)`;
    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${midiToNoteName(event.pitch)}${event.durationSteps > 1 ? ` ×${event.durationSteps}` : ''}`, x + 2, Math.max(8, y - velocityHeight / 2 - 5));
  }
  ctx.fillStyle = `${cream}.42)`;
  ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(VOICE_ALGORITHM_LABELS[activeAlgorithm], cssWidth - 2, 9);
  if (phase === 'committed') {
    ctx.fillStyle = 'rgba(184,216,175,.75)';
    ctx.fillText('PRODUCT CORE ✓', cssWidth - 2, 19);
  }
}

function stepFromPointer(event: PointerEvent): number {
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width - 0.01, event.clientX - rect.left));
  return Math.floor((x / rect.width) * STEP_COUNT);
}

function updateDebugPreview(committed = false): void {
  const result = activeResult();
  debugBody.textContent = JSON.stringify({
    state: committed ? 'ENQUEUED TO PRODUCT CORE' : phase.toUpperCase(),
    rawTake: capturedPcm ? { samples: capturedPcm.length, sampleRate: capturedSampleRate, seconds: capturedPcm.length / capturedSampleRate } : null,
    activeAlgorithm,
    enabledAlgorithms: [...enabledAlgorithms],
    calibrationSemitones: document.getElementById('algoCalibration') ? calibrationSemitones() : DEFAULT_CALIBRATION_SEMITONES,
    auditionTransposeSemitones: AUDITION_TRANSPOSE_SEMITONES,
    results: Object.fromEntries([...results.entries()].map(([id, value]) => [id, {
      noteCount: value.notes.length,
      elapsedMs: Math.round(value.elapsedMs),
      detail: value.detail,
      notes: value.notes,
    }])),
    activeCoreEvents: result ? createProductVoiceStepCommit(result.notes, TEST_LANE_INDEX, STEP_COUNT).events : [],
    coreLifecycle: productEngine.getLifecycleState(),
    coreError: lastCoreError,
  }, null, 2);
}

laneSelect.innerHTML = '<option value="0">Lead 1 · Soft Rhodes</option>';
laneSelect.value = '0';
laneSelect.disabled = true;
injectAlgorithmBench();
recordButton.addEventListener('click', () => { void beginCapture(); });
clearButton.addEventListener('click', clearAll);
keepButton.addEventListener('click', () => { void commitTake(); });
auditionButton.addEventListener('click', () => { void auditionTake(); });
redoButton.addEventListener('click', () => { phase = 'idle'; updateActionVisibility(); void beginCapture(); });
canvas.addEventListener('pointerdown', (event) => {
  const result = activeResult();
  if (!result || (phase !== 'review' && phase !== 'committed')) return;
  const step = stepFromPointer(event);
  const voiceEvent = result.notes.find((candidate) => step >= candidate.step && step <= candidate.endStep);
  if (voiceEvent) void auditionEvent(voiceEvent);
});
bpmInput.addEventListener('change', () => { quarterDuration = 60 / safeBpm(); stepDuration = quarterDuration / 4; markResultsStale(); });
window.addEventListener('resize', renderSteps, { passive: true });
window.addEventListener('pagehide', () => { clearAuditionTimers(); cancelAnimationFrame(animationFrame); releaseCaptureAudioNow(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (phase === 'count-in' || phase === 'recording')) {
    setError('Recording was interrupted because the page left the foreground. Redo the take.');
    releaseCaptureAudioNow();
  }
});

setCoreState('cold', 'core cold · Soft Rhodes');
setMicState('idle', 'mic idle');
hint.innerHTML = 'Record once, then compare <strong>Basic Pitch · Basic+Pitchy · CREPE · pYIN · Pitchy</strong> on the same PCM.';
resetCaptureState();
updateActionVisibility();
renderAlgorithmBench();
renderSteps();
updateDebugPreview();
