import {
  VOICE_ALGORITHM_PRESETS,
  applyVoiceAlgorithmPreset,
  getVoiceAlgorithmModifierState,
  setVoiceAlgorithmModifierState,
  type VoiceAlgorithmModifierState,
  type VoiceAlgorithmPresetId,
} from '../../src/ui/sequencer/voiceAlgorithmWorkbench';

let reanalyzeTimer = 0;

function numericValue(element: HTMLInputElement | HTMLSelectElement): number {
  const value = Number(element.value);
  return Number.isFinite(value) ? value : 0;
}

function cloneState(): any {
  return JSON.parse(JSON.stringify(getVoiceAlgorithmModifierState()));
}

function updatePath(path: string, value: number | boolean): void {
  const next = cloneState();
  next.preset = 'custom';
  const parts = path.split('.');
  let cursor = next;
  for (let index = 0; index < parts.length - 1; index += 1) cursor = cursor[parts[index]!] ??= {};
  cursor[parts[parts.length - 1]!] = value;
  setVoiceAlgorithmModifierState(next as VoiceAlgorithmModifierState);
  syncControls();
  markStaleAndSchedule();
}

function markStaleAndSchedule(): void {
  document.querySelectorAll<HTMLElement>('[data-state]').forEach((state) => {
    const text = state.textContent ?? '';
    if (text !== 'not analyzed' && !text.startsWith('failed')) state.textContent = 'modifier changed · re-analyze';
  });
  window.clearTimeout(reanalyzeTimer);
  reanalyzeTimer = window.setTimeout(() => {
    const button = document.getElementById('analyzeAlgorithms') as HTMLButtonElement | null;
    if (button && !button.disabled) button.click();
  }, 520);
}

function setValue(id: string, value: number | string | boolean): void {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!element) return;
  if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = Boolean(value);
  else element.value = String(value);
}

function syncControls(): void {
  const state = getVoiceAlgorithmModifierState();
  setValue('voicePreset', state.preset);
  setValue('voiceMinHz', state.minHz);
  setValue('voiceMaxHz', state.maxHz);
  setValue('voiceMinNote', state.minNoteMs);
  setValue('voiceGapBridge', state.gapBridgeMs);
  setValue('voiceOctavePersistence', state.octavePersistenceFrames);
  setValue('voiceCenterTrim', Math.round(state.centerTrimFraction * 100));

  setValue('bpOnset', state.basicPitch.onsetThreshold);
  setValue('bpFrame', state.basicPitch.frameThreshold);
  setValue('bpMinFrames', state.basicPitch.minNoteFrames);
  setValue('bpInfer', state.basicPitch.inferOnsets);
  setValue('bpMelodia', state.basicPitch.melodiaTrick);
  setValue('bpEnergy', state.basicPitch.energyTolerance);

  setValue('hybridBodyStart', Math.round(state.hybrid.bodyStartFraction * 100));
  setValue('hybridBodyEnd', Math.round(state.hybrid.bodyEndFraction * 100));
  setValue('hybridClarity', state.hybrid.clarityThreshold);

  setValue('crepeConfidence', state.crepe.confidenceThreshold);
  setValue('crepeFrame', state.crepe.frameSize);
  setValue('crepeHop', state.crepe.hopSize);
  setValue('crepeTrajectory', state.crepe.trajectorySmoothing);

  setValue('pyinClarity', state.pyin.clarityThreshold);
  setValue('pyinFrame', state.pyin.frameSize);
  setValue('pyinHop', state.pyin.hopSize);
  setValue('pyinTransition', state.pyin.maxTransitionSemitonesPerSecond);

  setValue('pitchyClarity', state.pitchy.clarityThreshold);
  setValue('pitchyFrame', state.pitchy.frameSize);
  setValue('pitchyHop', state.pitchy.hopSize);

  const summary = document.getElementById('voiceModifierSummary');
  if (summary) {
    const label = state.preset === 'neutral' ? 'Neutral'
      : state.preset === 'sung-held' ? 'Sung / Held'
        : state.preset === 'vocal-percussive' ? 'Bum / Dung / Deng'
          : 'Custom';
    summary.textContent = `${label} · ${state.minHz}–${state.maxHz} Hz · ≥${state.minNoteMs} ms · bridge ${state.gapBridgeMs} ms`;
  }
}

function bindNumber(id: string, path: string, transform: (value: number) => number = (value) => value): void {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  element?.addEventListener('change', () => updatePath(path, transform(numericValue(element))));
}

function bindCheckbox(id: string, path: string): void {
  const element = document.getElementById(id) as HTMLInputElement | null;
  element?.addEventListener('change', () => updatePath(path, element.checked));
}

function inject(): void {
  const bench = document.querySelector<HTMLElement>('.algo-bench');
  if (!bench || document.getElementById('voiceModifierPanel')) return;

  const style = document.createElement('style');
  style.textContent = `
    .voice-modifiers{margin:0 0 10px;border:1px solid var(--cream-10);background:rgba(232,220,196,.018)}
    .voice-modifier-top{display:flex;align-items:center;gap:8px;padding:8px}
    .voice-modifier-top label{font-size:7px;letter-spacing:.12em;text-transform:uppercase;color:var(--cream-42)}
    .voice-modifier-top select{min-height:30px;max-width:150px}
    .voice-modifier-summary{margin-left:auto;font-size:7px;color:var(--cream-42);text-align:right;line-height:1.3}
    .voice-common{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;padding:0 8px 8px}
    .voice-field{display:flex;flex-direction:column;gap:3px;min-width:0;font-size:7px;color:var(--cream-42)}
    .voice-field input,.voice-field select{width:100%;min-width:0;min-height:28px;padding:3px 4px;font-size:8px}
    .voice-advanced{border-top:1px solid var(--cream-10)}
    .voice-advanced summary{cursor:pointer;padding:7px 8px;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream-42)}
    .voice-algo-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:0 8px 9px}
    .voice-algo-group{border:1px solid var(--cream-10);padding:7px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;align-content:start}
    .voice-algo-group h4{grid-column:1/-1;margin:0 0 2px;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream-70);font-weight:500}
    .voice-check{display:flex;align-items:center;gap:5px;font-size:7px;color:var(--cream-42)}.voice-check input{width:12px;height:12px}
    @media(max-width:600px){.voice-common{grid-template-columns:repeat(3,minmax(0,1fr))}.voice-algo-settings{grid-template-columns:1fr}.voice-modifier-top{flex-wrap:wrap}.voice-modifier-summary{width:100%;margin-left:0;text-align:left}.voice-algo-group{grid-template-columns:repeat(3,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'voiceModifierPanel';
  panel.className = 'voice-modifiers';
  panel.innerHTML = `
    <div class="voice-modifier-top">
      <label for="voicePreset">Tuning preset</label>
      <select id="voicePreset">
        <option value="neutral">Neutral</option>
        <option value="sung-held">Sung / Held</option>
        <option value="vocal-percussive">Bum / Dung / Deng</option>
        <option value="custom" disabled>Custom</option>
      </select>
      <span id="voiceModifierSummary" class="voice-modifier-summary"></span>
    </div>
    <div class="voice-common">
      <label class="voice-field">MIN Hz<input id="voiceMinHz" type="number" min="35" max="1000" step="5"/></label>
      <label class="voice-field">MAX Hz<input id="voiceMaxHz" type="number" min="100" max="3000" step="10"/></label>
      <label class="voice-field">MIN NOTE ms<input id="voiceMinNote" type="number" min="20" max="500" step="10"/></label>
      <label class="voice-field">GAP BRIDGE ms<input id="voiceGapBridge" type="number" min="0" max="250" step="5"/></label>
      <label class="voice-field">JUMP FRAMES<input id="voiceOctavePersistence" type="number" min="1" max="10" step="1"/></label>
      <label class="voice-field">CENTER TRIM %<input id="voiceCenterTrim" type="number" min="0" max="42" step="1"/></label>
    </div>
    <details class="voice-advanced">
      <summary>Advanced · algorithm-specific modifiers</summary>
      <div class="voice-algo-settings">
        <div class="voice-algo-group">
          <h4>Basic Pitch</h4>
          <label class="voice-field">ONSET<input id="bpOnset" type="number" min="0.05" max="0.95" step="0.01"/></label>
          <label class="voice-field">FRAME<input id="bpFrame" type="number" min="0.05" max="0.95" step="0.01"/></label>
          <label class="voice-field">MIN FRAMES<input id="bpMinFrames" type="number" min="1" max="40" step="1"/></label>
          <label class="voice-field">ENERGY TOL<input id="bpEnergy" type="number" min="0" max="60" step="1"/></label>
          <label class="voice-check"><input id="bpInfer" type="checkbox"/> inferred onsets</label>
          <label class="voice-check"><input id="bpMelodia" type="checkbox"/> melodia cleanup</label>
        </div>
        <div class="voice-algo-group">
          <h4>Basic Pitch + Pitchy body</h4>
          <label class="voice-field">BODY START %<input id="hybridBodyStart" type="number" min="0" max="45" step="1"/></label>
          <label class="voice-field">BODY END %<input id="hybridBodyEnd" type="number" min="55" max="100" step="1"/></label>
          <label class="voice-field">CLARITY<input id="hybridClarity" type="number" min="0.1" max="0.99" step="0.01"/></label>
        </div>
        <div class="voice-algo-group">
          <h4>CREPE</h4>
          <label class="voice-field">CONF<input id="crepeConfidence" type="number" min="0.1" max="0.99" step="0.01"/></label>
          <label class="voice-field">FRAME<select id="crepeFrame"><option>1024</option><option>2048</option><option>4096</option><option>8192</option></select></label>
          <label class="voice-field">HOP<select id="crepeHop"><option>128</option><option>256</option><option>512</option><option>1024</option></select></label>
          <label class="voice-check"><input id="crepeTrajectory" type="checkbox"/> trajectory smoothing</label>
        </div>
        <div class="voice-algo-group">
          <h4>pYIN</h4>
          <label class="voice-field">CLARITY<input id="pyinClarity" type="number" min="0.1" max="0.99" step="0.01"/></label>
          <label class="voice-field">FRAME<select id="pyinFrame"><option>1024</option><option>2048</option><option>4096</option><option>8192</option></select></label>
          <label class="voice-field">HOP<select id="pyinHop"><option>128</option><option>256</option><option>512</option><option>1024</option></select></label>
          <label class="voice-field">MAX st/s<input id="pyinTransition" type="number" min="2" max="120" step="1"/></label>
        </div>
        <div class="voice-algo-group">
          <h4>Pitchy / McLeod</h4>
          <label class="voice-field">CLARITY<input id="pitchyClarity" type="number" min="0.1" max="0.99" step="0.01"/></label>
          <label class="voice-field">FRAME<select id="pitchyFrame"><option>1024</option><option>2048</option><option>4096</option><option>8192</option></select></label>
          <label class="voice-field">HOP<select id="pitchyHop"><option>128</option><option>256</option><option>512</option><option>1024</option></select></label>
        </div>
      </div>
    </details>`;

  const head = bench.querySelector('.algo-head');
  head?.insertAdjacentElement('afterend', panel);

  const presetSelect = document.getElementById('voicePreset') as HTMLSelectElement;
  presetSelect.addEventListener('change', () => {
    const id = presetSelect.value as VoiceAlgorithmPresetId;
    if (id === 'custom') return;
    applyVoiceAlgorithmPreset(id);
    syncControls();
    markStaleAndSchedule();
  });

  bindNumber('voiceMinHz', 'minHz');
  bindNumber('voiceMaxHz', 'maxHz');
  bindNumber('voiceMinNote', 'minNoteMs');
  bindNumber('voiceGapBridge', 'gapBridgeMs');
  bindNumber('voiceOctavePersistence', 'octavePersistenceFrames');
  bindNumber('voiceCenterTrim', 'centerTrimFraction', (value) => value / 100);

  bindNumber('bpOnset', 'basicPitch.onsetThreshold');
  bindNumber('bpFrame', 'basicPitch.frameThreshold');
  bindNumber('bpMinFrames', 'basicPitch.minNoteFrames');
  bindNumber('bpEnergy', 'basicPitch.energyTolerance');
  bindCheckbox('bpInfer', 'basicPitch.inferOnsets');
  bindCheckbox('bpMelodia', 'basicPitch.melodiaTrick');

  bindNumber('hybridBodyStart', 'hybrid.bodyStartFraction', (value) => value / 100);
  bindNumber('hybridBodyEnd', 'hybrid.bodyEndFraction', (value) => value / 100);
  bindNumber('hybridClarity', 'hybrid.clarityThreshold');

  bindNumber('crepeConfidence', 'crepe.confidenceThreshold');
  bindNumber('crepeFrame', 'crepe.frameSize');
  bindNumber('crepeHop', 'crepe.hopSize');
  bindCheckbox('crepeTrajectory', 'crepe.trajectorySmoothing');

  bindNumber('pyinClarity', 'pyin.clarityThreshold');
  bindNumber('pyinFrame', 'pyin.frameSize');
  bindNumber('pyinHop', 'pyin.hopSize');
  bindNumber('pyinTransition', 'pyin.maxTransitionSemitonesPerSecond');

  bindNumber('pitchyClarity', 'pitchy.clarityThreshold');
  bindNumber('pitchyFrame', 'pitchy.frameSize');
  bindNumber('pitchyHop', 'pitchy.hopSize');

  syncControls();
}

function tryInject(attempt = 0): void {
  if (document.querySelector('.algo-bench')) {
    inject();
    return;
  }
  if (attempt < 12) window.setTimeout(() => tryInject(attempt + 1), 25);
}

// Keep the module standalone: the main comparison controller owns recording and
// Product Core; this panel owns only transcription tuning state.
void VOICE_ALGORITHM_PRESETS;
tryInject();
