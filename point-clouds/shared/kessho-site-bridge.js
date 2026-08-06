/*
 * Small, framework-free adapter for the Point Clouds pages.
 *
 * The audio engine remains the Product Core runtime in the hidden iframe. This
 * file only coordinates that runtime and projects its authoritative telemetry
 * into a page-friendly shape; it never creates an AudioContext or substitutes
 * an oscillator when the engine is unavailable.
 */
(function installPointCloudsKessho(global) {
  'use strict';

  if (!global) return;

  const DEFAULT_PRESET_ID = 'string-waves';
  const DEFAULT_ENGINE_TIMEOUT_MS = 15_000;
  const RUNNING_TIMEOUT_MS = 8_000;
  const STOPPED_TIMEOUT_MS = 8_000;
  const TELEMETRY_INTERVAL_MS = 60; // ~16.7 Hz; visual pages can safely render at 60 Hz.
  const VISUAL_INPUT_SCHEMA_VERSION = 1;
  const VISUAL_INPUT_SIGNALS = Object.freeze([
    'level',
    'peak',
    'onset',
    'transient',
    'activity',
    'phase',
    'pulse',
  ]);

  function visualReaction(id, signal, description) {
    return Object.freeze({ id, signal, description });
  }

  function visualInput(definition) {
    const provider = { ...definition.provider };
    for (const key of ['fields', 'indices', 'tapIds']) {
      if (Array.isArray(provider[key])) provider[key] = Object.freeze(provider[key].slice());
    }
    return Object.freeze({
      ...definition,
      children: Object.freeze((definition.children ?? []).slice()),
      signals: Object.freeze((definition.signals ?? VISUAL_INPUT_SIGNALS).slice()),
      provider: Object.freeze(provider),
      reactions: Object.freeze(definition.reactions.slice()),
    });
  }

  // This is the only routing-to-visual dictionary. Consumers address parent
  // families, never Pad 1/Pad 2, Lead 1/Lead 2, Delay A/Delay B, or individual
  // Earth layers. Provider metadata documents exactly which Product Core
  // signal owns a channel; unavailable return taps remain unavailable rather
  // than silently borrowing the master or aggregate FX level.
  const VISUAL_INPUT_REGISTRY = Object.freeze([
    visualInput({
      id: 'master',
      label: 'Master',
      family: 'system',
      children: [],
      provider: { kind: 'master-output', fields: ['masterOutputRms', 'masterOutputPeak'] },
      reactions: [
        visualReaction('global-breath', 'level', 'Expand and contract the complete point field with the output envelope.'),
        visualReaction('luminance-ceiling', 'peak', 'Lift point luminance and bloom as the mix approaches its peak ceiling.'),
        visualReaction('depth-pressure', 'transient', 'Push a short pressure wave through Z depth on mix transients.'),
      ],
    }),
    visualInput({
      id: 'pads',
      label: 'Pads',
      family: 'source',
      children: ['pad1', 'pad2'],
      provider: { kind: 'stems', indices: [1, 2], aggregation: 'max' },
      reactions: [
        visualReaction('soft-volume', 'level', 'Inflate the cloud into a slow, soft-edged volume.'),
        visualReaction('harmonic-drift', 'activity', 'Increase low-frequency flow-field drift without adding jitter.'),
        visualReaction('veil-opacity', 'peak', 'Thicken the rear depth veil while leaving foreground points legible.'),
      ],
    }),
    visualInput({
      id: 'leads',
      label: 'Leads',
      family: 'source',
      children: ['lead1', 'lead2'],
      provider: { kind: 'stems', indices: [3, 4], aggregation: 'max' },
      reactions: [
        visualReaction('filament-attractor', 'level', 'Pull nearby points into a directional filament around the lead voice.'),
        visualReaction('note-tracer', 'onset', 'Launch a short-lived tracer from the current interaction focus.'),
        visualReaction('accent-heat', 'transient', 'Concentrate the warm accent points at the front of the cloud.'),
      ],
    }),
    visualInput({
      id: 'samples',
      label: 'Samples',
      family: 'source',
      children: ['sample1', 'sample2'],
      provider: { kind: 'stems', indices: [6, 8], aggregation: 'max' },
      reactions: [
        visualReaction('contour-imprint', 'level', 'Reveal a temporary contour or surface imprint inside the cloud.'),
        visualReaction('material-displacement', 'onset', 'Displace a local patch as if a recorded object struck the point surface.'),
        visualReaction('orbit-fragments', 'transient', 'Release a small orbiting fragment cluster on sharp sample attacks.'),
      ],
    }),
    visualInput({
      id: 'drums',
      label: 'Drums',
      family: 'source',
      children: ['drums'],
      provider: { kind: 'stems', indices: [5], aggregation: 'max' },
      reactions: [
        visualReaction('radial-impact', 'pulse', 'Send a radial compression ring through the point structure.'),
        visualReaction('lattice-snap', 'onset', 'Momentarily tighten point spacing, then rebound with spring weight.'),
        visualReaction('rotation-impulse', 'transient', 'Add a bounded rotational impulse to the shared 3D physics body.'),
      ],
    }),
    visualInput({
      id: 'earth',
      label: 'Earth',
      family: 'source',
      children: ['waves', 'water', 'insects', 'nature'],
      provider: { kind: 'stems', indices: [7], aggregation: 'max' },
      reactions: [
        visualReaction('topographic-flow', 'level', 'Move points along a slow topographic flow field.'),
        visualReaction('spatial-weather', 'activity', 'Broaden the field and increase depth-dependent atmospheric dropout.'),
        visualReaction('terrain-grain', 'peak', 'Modulate fine point density like changing terrain texture.'),
      ],
    }),
    visualInput({
      id: 'effects',
      label: 'Effects',
      family: 'bus',
      children: ['granular', 'delayAOut', 'delayBOut', 'degrade', 'reverb'],
      provider: { kind: 'stems', indices: [9], aggregation: 'max' },
      reactions: [
        visualReaction('wet-depth', 'level', 'Increase the apparent depth and persistence of the complete wet field.'),
        visualReaction('return-afterimage', 'peak', 'Leave a restrained afterimage behind moving structures.'),
        visualReaction('edge-diffusion', 'activity', 'Diffuse silhouette edges without changing the dry geometry.'),
      ],
    }),
    visualInput({
      id: 'granular',
      label: 'Granular',
      family: 'processor',
      children: ['granular'],
      provider: {
        kind: 'graph-taps',
        tapIds: [16],
        fields: ['workletGranularReturnPeak'],
        aggregation: 'max',
      },
      reactions: [
        visualReaction('fragment-density', 'level', 'Break solid forms into denser, smaller point fragments.'),
        visualReaction('grain-jitter', 'activity', 'Add spatially correlated micro-motion instead of white-noise jitter.'),
        visualReaction('grain-trails', 'onset', 'Emit short trails whose length follows grain activity.'),
      ],
    }),
    visualInput({
      id: 'delays',
      label: 'Delays',
      family: 'processor',
      children: ['delayAOut', 'delayBOut'],
      provider: {
        kind: 'graph-taps',
        tapIds: [8, 12],
        fields: ['workletDelayReturnPeak'],
        aggregation: 'max',
      },
      reactions: [
        visualReaction('echo-ghosts', 'level', 'Repeat the current form as depth-offset, decaying ghost layers.'),
        visualReaction('recursive-rings', 'onset', 'Create successively dimmer rings at the delay cadence.'),
        visualReaction('phase-orbit', 'activity', 'Offset orbit phase while preserving the main cloud position.'),
      ],
    }),
    visualInput({
      id: 'degrade',
      label: 'Degrade',
      family: 'processor',
      children: ['degrade'],
      provider: { kind: 'engine-return', fields: ['workletDegradeReturnPeak'] },
      reactions: [
        visualReaction('point-erosion', 'level', 'Remove coherent point bands in slowly changing erosion patches.'),
        visualReaction('quantized-drift', 'activity', 'Quantize selected motion vectors while the rest of the body stays fluid.'),
        visualReaction('dropout-scars', 'transient', 'Carve momentary gaps that heal with the shared spring system.'),
      ],
    }),
    visualInput({
      id: 'reverb',
      label: 'Reverb',
      family: 'processor',
      children: ['reverb'],
      provider: {
        kind: 'graph-taps',
        tapIds: [21],
        fields: ['workletReverbReturnPeak'],
        aggregation: 'max',
      },
      reactions: [
        visualReaction('z-expansion', 'level', 'Open the cloud along Z while retaining its 2D silhouette.'),
        visualReaction('tail-afterglow', 'peak', 'Extend point persistence as an afterglow proportional to the return.'),
        visualReaction('fog-dispersion', 'activity', 'Move low-opacity points outward into the far depth field.'),
      ],
    }),
    visualInput({
      id: 'transport',
      label: 'Transport',
      family: 'system',
      children: [],
      provider: { kind: 'transport', fields: ['beatPosition', 'barIndex', 'phraseIndex'] },
      reactions: [
        visualReaction('beat-breath', 'pulse', 'Apply a small shared breath impulse at the beat boundary.'),
        visualReaction('bar-weight-shift', 'phase', 'Shift the body weight across one bar without resetting rotation.'),
        visualReaction('phrase-morph', 'phase', 'Schedule large topology changes only at phrase boundaries.'),
      ],
    }),
  ]);

  const VISUAL_INPUT_LIBRARY = Object.freeze({
    schemaVersion: VISUAL_INPUT_SCHEMA_VERSION,
    signals: VISUAL_INPUT_SIGNALS,
    availability: Object.freeze({
      available: 'The Product Core provider is authoritative, including when its value is zero.',
      unavailable: 'The exact provider is not being published; consumers must not substitute another channel.',
    }),
    inputs: VISUAL_INPUT_REGISTRY,
    byId: Object.freeze(Object.fromEntries(VISUAL_INPUT_REGISTRY.map((input) => [input.id, input]))),
  });

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, finiteNumber(value)));
  }

  function copyArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function copyObject(value) {
    if (!value || typeof value !== 'object') return {};
    return { ...value };
  }

  function hasFiniteField(object, key) {
    return object !== null
      && typeof object === 'object'
      && Object.prototype.hasOwnProperty.call(object, key)
      && Number.isFinite(Number(object[key]));
  }

  function maxValues(values) {
    let peak = 0;
    for (const value of values) peak = Math.max(peak, Math.max(0, finiteNumber(value)));
    return peak;
  }

  function readStemProvider(raw, provider) {
    const stems = Array.isArray(raw?.workletStemPeaks) ? raw.workletStemPeaks : null;
    const indices = provider.indices ?? [];
    if (!stems || indices.length === 0 || indices.some((index) => !hasFiniteField(stems, index))) {
      return { available: false, peak: 0 };
    }
    return { available: true, peak: maxValues(indices.map((index) => stems[index])) };
  }

  function readReturnProvider(raw, provider) {
    const fields = provider.fields ?? [];
    const directValues = fields.filter((field) => hasFiniteField(raw, field)).map((field) => raw[field]);
    if (directValues.length > 0) return { available: true, peak: maxValues(directValues) };

    const tapIds = provider.tapIds ?? [];
    const tapPeaks = Array.isArray(raw?.workletGraphTapPeaks) ? raw.workletGraphTapPeaks : null;
    const tapValidity = Array.isArray(raw?.workletGraphTapPeakValid) ? raw.workletGraphTapPeakValid : null;
    const activeTapIds = Array.isArray(raw?.workletGraphTapActiveIds) ? raw.workletGraphTapActiveIds : [];
    const validTap = (tapId) => tapValidity?.[tapId] === true || activeTapIds.includes(tapId);
    if (
      !tapPeaks
      || tapIds.length === 0
      || tapIds.some((tapId) => !validTap(tapId) || !hasFiniteField(tapPeaks, tapId))
    ) {
      return { available: false, peak: 0 };
    }
    return { available: true, peak: maxValues(tapIds.map((tapId) => tapPeaks[tapId])) };
  }

  function makeVisualChannel(id, available, level, peak, previous, options = {}) {
    const previousChannel = previous?.channels?.[id] ?? null;
    const normalizedLevel = available ? Math.max(0, finiteNumber(level)) : 0;
    const normalizedPeak = available ? Math.max(0, finiteNumber(peak)) : 0;
    const previousPeak = previousChannel?.available ? finiteNumber(previousChannel.peak) : normalizedPeak;
    const onset = available
      ? (Number.isFinite(Number(options.onset))
        ? clamp01(options.onset)
        : clamp01(Math.max(0, normalizedPeak - previousPeak) * 4))
      : 0;
    const pulse = available ? clamp01(options.pulse) : 0;
    const transient = available
      ? clamp01(Math.max(onset, finiteNumber(options.transient), pulse))
      : 0;
    const activity = available
      ? clamp01(options.activity ?? Math.sqrt(Math.max(normalizedLevel, normalizedPeak)))
      : 0;
    return {
      id,
      available,
      availability: available ? 'available' : 'unavailable',
      active: available && (activity > 0.001 || pulse > 0),
      level: normalizedLevel,
      peak: normalizedPeak,
      onset,
      transient,
      activity,
      phase: available && Number.isFinite(Number(options.phase)) ? clamp01(options.phase) : null,
      pulse,
    };
  }

  function normalizeVisualInputs(raw, previous, context) {
    const channels = {};
    const masterAvailable = hasFiniteField(raw, 'masterOutputRms') && hasFiniteField(raw, 'masterOutputPeak');
    channels.master = makeVisualChannel(
      'master',
      masterAvailable,
      context.rms,
      context.peak,
      previous,
      { onset: context.onset, transient: context.transient },
    );

    for (const definition of VISUAL_INPUT_REGISTRY) {
      if (definition.id === 'master' || definition.id === 'transport') continue;
      const reading = definition.provider.kind === 'stems'
        ? readStemProvider(raw, definition.provider)
        : readReturnProvider(raw, definition.provider);
      const pulse = definition.id === 'drums' && context.drumHitPulse ? 1 : 0;
      channels[definition.id] = makeVisualChannel(
        definition.id,
        reading.available,
        reading.peak,
        reading.peak,
        previous,
        { pulse },
      );
    }

    const transportAvailable = hasFiniteField(raw, 'beatPosition');
    const beat = transportAvailable ? Number(raw.beatPosition) : 0;
    channels.transport = makeVisualChannel(
      'transport',
      transportAvailable,
      raw?.transportRunning === true ? 1 : 0,
      context.hitPulse ? 1 : 0,
      previous,
      {
        activity: raw?.transportRunning === true ? 1 : 0,
        phase: beat - Math.floor(beat),
        pulse: context.beatPulse || context.stepPulse || context.hitPulse ? 1 : 0,
      },
    );

    return {
      schemaVersion: VISUAL_INPUT_SCHEMA_VERSION,
      channels,
    };
  }

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRunningStatus(status) {
    if (!status || status.isRunning !== true) return false;
    const telemetry = status.telemetry;
    if (!telemetry || telemetry.transportRunning !== true) return false;
    // Newer engine bridges expose these two fields. Keep the compatibility
    // fallback for older Product Core bundles, whose start() already verifies
    // lifecycle and whose telemetry transport flag is authoritative here.
    if (status.lifecycleState !== undefined && status.lifecycleState !== 'running') return false;
    if (status.audioContextState && status.audioContextState !== 'running') return false;
    return true;
  }

  function isStoppedStatus(status) {
    if (!status) return true;
    // Product Core may keep its lifecycle and resumed AudioContext alive for
    // the next user gesture. Playback/transport truth is the stop contract;
    // lifecycle/context values are diagnostics and must not veto it. Once the
    // lifecycle has reached `stopped`, the telemetry surface can still hold
    // its final running sample because polling is intentionally disabled;
    // lifecycle + isRunning are then the authoritative completion signal.
    if (status.lifecycleState === 'stopped' && status.isRunning !== true) return true;
    return status.isRunning !== true && status.telemetry?.transportRunning !== true;
  }

  function resolveEngineUrl() {
    // Resolve from this script rather than from the page: both alternatives
    // and the original Point Clouds page can then share the same relative
    // asset, even when nested at different depths.
    const documentObject = global.document;
    const scriptUrl = documentObject?.currentScript?.src
      || documentObject?.querySelector?.('script[src*="kessho-site-bridge"]')?.src;
    if (scriptUrl) {
      try {
        return new URL('../../index.html?point-clouds-engine=1', scriptUrl).href;
      } catch {
        // Fall through to the page URL below.
      }
    }
    try {
      return new URL('../?point-clouds-engine=1', global.location?.href ?? '').href;
    } catch {
      return null;
    }
  }

  function resolveBridgeScriptUrl() {
    const documentObject = global.document;
    const currentScriptUrl = documentObject?.currentScript?.src;
    if (currentScriptUrl) return currentScriptUrl;
    const externalScriptUrl = documentObject?.querySelector?.('script[src*="kessho-site-bridge"]')?.src;
    return externalScriptUrl || global.location?.href || '';
  }

  function resolveEmbeddedEngineDocumentUrl() {
    const bridgeScriptUrl = resolveBridgeScriptUrl();
    try {
      return new URL('./embedded/kessho-engine.html', bridgeScriptUrl).href;
    } catch {
      return null;
    }
  }

  function resolveEmbeddedEngineAssetUrls() {
    const bridgeScriptUrl = resolveBridgeScriptUrl();
    try {
      return {
        assets: new URL('./embedded/kessho-product-core-assets.js', bridgeScriptUrl).href,
        engine: new URL('./embedded/kessho-engine.iife.js', bridgeScriptUrl).href,
      };
    } catch {
      return null;
    }
  }

  function bootstrapEmbeddedEngineInParent() {
    const documentObject = global.document;
    if (!documentObject?.createElement) return false;
    const urls = resolveEmbeddedEngineAssetUrls();
    const parent = documentObject.head || documentObject.body || documentObject.documentElement;
    if (!urls || !parent?.appendChild) return false;
    const stateKey = '__pointCloudsEmbeddedEngineBootstrap';
    if (global[stateKey]) return true;

    // Mount the generated Product Core application in this page rather than
    // crossing an opaque file/srcdoc iframe boundary. The engine entry itself
    // creates its one-pixel hidden root; setting this flag before loading the
    // bundle keeps App.tsx on the engine-only path.
    global.__pointCloudsEmbeddedEngineMode = true;
    const state = { status: 'loading', error: null };
    global[stateKey] = state;
    const append = (src, next) => {
      const script = documentObject.createElement('script');
      script.async = false;
      script.src = src;
      script.onload = next;
      script.onerror = () => {
        state.status = 'failed';
        state.error = `Unable to load embedded Product Core script: ${src}`;
      };
      parent.appendChild(script);
    };
    append(urls.assets, () => {
      if (state.status === 'failed') return;
      append(urls.engine, () => {
        if (state.status !== 'failed') state.status = 'ready';
      });
    });
    return true;
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function createEmbeddedEngineSrcdoc() {
    const bridgeScriptUrl = resolveBridgeScriptUrl();
    let assetsUrl;
    let engineUrl;
    try {
      assetsUrl = new URL('./embedded/kessho-product-core-assets.js', bridgeScriptUrl).href;
      engineUrl = new URL('./embedded/kessho-engine.iife.js', bridgeScriptUrl).href;
    } catch {
      throw new Error('Unable to resolve the embedded Product Core bundle from the bridge script.');
    }
    // Keep the frame document intentionally tiny. The first inline script is
    // evaluated before either generated classic bundle, so App.tsx observes
    // the engine-mode flag during module initialization.
    return [
      '<!doctype html><html><head><meta charset="utf-8"></head><body>',
      '<div id="kessho-engine-root" aria-hidden="true" style="width:1px;height:1px;overflow:hidden"></div>',
      '<script>window.__pointCloudsEmbeddedEngineMode = true;</script>',
      `<script src="${escapeAttribute(assetsUrl)}"></script>`,
      `<script src="${escapeAttribute(engineUrl)}"></script>`,
      '</body></html>',
    ].join('');
  }

  function normalizePresetList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((preset) => preset && typeof preset.id === 'string')
      .map((preset) => ({
        id: preset.id,
        name: typeof preset.name === 'string' ? preset.name : preset.id,
      }));
  }

  /**
   * Project one Product Core status into a stable website telemetry snapshot.
   * The `raw` field intentionally keeps the complete engine telemetry so a
   * visualizer never has to guess at a missing Product Core field.
   */
  function normalizeTelemetry(status, previous, previousAt) {
    const raw = status?.telemetry && typeof status.telemetry === 'object'
      ? status.telemetry
      : null;
    const now = typeof performance !== 'undefined' && Number.isFinite(performance.now?.())
      ? performance.now()
      : Date.now();
    const rms = Math.max(0, finiteNumber(raw?.masterOutputRms));
    const peak = Math.max(0, finiteNumber(raw?.masterOutputPeak));
    const previousRms = previous ? finiteNumber(previous.rms) : rms;
    const previousPeak = previous ? finiteNumber(previous.peak) : peak;
    const rmsDelta = rms - previousRms;
    const peakDelta = peak - previousPeak;
    // These are derivatives of actual Product Core output telemetry. No
    // synthetic waveform, clock, or pulse is introduced when telemetry is
    // absent or unchanged.
    const onset = clamp01(Math.max(0, rmsDelta) * 4 + Math.max(0, peakDelta) * 2);
    const transient = clamp01(Math.max(0, peakDelta, rmsDelta));
    const synthSteps = copyArray(raw?.synthSequencerCurrentSteps);
    const drumSteps = copyArray(raw?.drumSequencerCurrentSteps);
    const synthHits = copyArray(raw?.synthSequencerHitCounts);
    const drumHits = copyArray(raw?.drumSequencerHitCounts);
    const pulses = finiteNumber(raw?.sequencerEventCount);
    const previousPulses = previous ? finiteNumber(previous.sequencer?.pulses) : pulses;
    const pulseDelta = Math.max(0, pulses - previousPulses);
    const beat = Number.isFinite(Number(raw?.beatPosition)) ? Number(raw.beatPosition) : null;
    const previousBeat = previous && Number.isFinite(Number(previous.beat)) ? Number(previous.beat) : null;
    const beatPulse = beat !== null && previousBeat !== null && Math.floor(beat) !== Math.floor(previousBeat);
    const currentStep = synthSteps.length > 0
      ? finiteNumber(synthSteps[0], null)
      : (drumSteps.length > 0 ? finiteNumber(drumSteps[0], null) : null);
    const previousSynthSteps = previous?.sequencer?.synthSteps ?? [];
    const previousDrumSteps = previous?.sequencer?.drumSteps ?? [];
    const stepPulse = synthSteps.some((value, index) => value !== previousSynthSteps[index])
      || drumSteps.some((value, index) => value !== previousDrumSteps[index]);
    const sum = (values) => values.reduce((total, value) => total + finiteNumber(value), 0);
    const synthHitCountDelta = Math.max(
      0,
      sum(synthHits) - sum(previous?.sequencer?.synthHitCounts ?? []),
    );
    const drumHitCountDelta = Math.max(
      0,
      sum(drumHits) - sum(previous?.sequencer?.drumHitCounts ?? []),
    );
    const hitCountDelta = synthHitCountDelta + drumHitCountDelta;
    const hitPulse = pulseDelta > 0 || hitCountDelta > 0;
    const drumHitPulse = drumHitCountDelta > 0;
    const stemPeakValues = copyArray(raw?.workletStemPeaks).map((value) => Math.max(0, finiteNumber(value)));
    const stemPeaks = {
      // Product Core publishes named stem peaks where available. The array
      // indices are intentionally not interpreted: Product Core's named
      // fields are the only authoritative source for these labels.
      pad: Math.max(0, finiteNumber(raw?.workletPadStemPeak)),
      lead: Math.max(0, finiteNumber(raw?.workletLeadStemPeak)),
      fx: Math.max(0, finiteNumber(raw?.workletFxStemPeak)),
      master: Math.max(0, finiteNumber(raw?.workletMasterStemPeak)),
    };
    const visualInputs = normalizeVisualInputs(raw, previous?.visualInputs, {
      rms,
      peak,
      onset,
      transient,
      beatPulse,
      stepPulse,
      hitPulse,
      drumHitPulse,
    });

    return {
      // Engine truth, preserved verbatim for diagnostics and future fields.
      raw,
      rms,
      peak,
      rmsDelta,
      peakDelta,
      onset,
      transient,
      beat,
      bar: Number.isFinite(Number(raw?.barIndex)) ? Number(raw.barIndex) : null,
      phrase: Number.isFinite(Number(raw?.phraseIndex)) ? Number(raw.phraseIndex) : null,
      phraseProgress: Number.isFinite(Number(raw?.transportPhraseProgress))
        ? clamp01(raw.transportPhraseProgress)
        : null,
      sequencer: {
        synthStep: synthSteps.length > 0 ? finiteNumber(synthSteps[0], null) : null,
        drumStep: drumSteps.length > 0 ? finiteNumber(drumSteps[0], null) : null,
        synthSteps,
        drumSteps,
        synthHitCounts: synthHits,
        drumHitCounts: drumHits,
        pulses,
        pulseDelta,
        stepPulse,
        hitPulse,
        hitCountDelta,
        synthHitCountDelta,
        drumHitCountDelta,
        scatterPulseCount: finiteNumber(raw?.scatterPulseCount),
      },
      // Common aliases keep the bridge ergonomic for small canvas sketches.
      currentStep,
      sequencerStep: currentStep,
      step: currentStep,
      barIndex: Number.isFinite(Number(raw?.barIndex)) ? Number(raw.barIndex) : null,
      phraseIndex: Number.isFinite(Number(raw?.phraseIndex)) ? Number(raw.phraseIndex) : null,
      beatPulse,
      isBeat: beatPulse,
      beatIndex: beat === null ? null : Math.floor(beat),
      pulses,
      pulseDelta,
      stepPulse,
      hitPulse,
      isHit: hitPulse,
      trigger: hitPulse,
      level: rms,
      activeVoices: Math.max(0, finiteNumber(raw?.activeVoices)),
      activeSources: Math.max(0, finiteNumber(raw?.activeSources)),
      // Keep the engine's original array intact; named aliases are exposed
      // separately so consumers do not infer undocumented array ordering.
      stemPeaks: stemPeakValues,
      stemPeakValues,
      stemPeaksByName: stemPeaks,
      stems: stemPeaks,
      activeGrains: Math.max(0, finiteNumber(raw?.activeGrains)),
      visualInputs,
      transportRunning: raw?.transportRunning === true,
      playing: status?.isRunning === true && raw?.transportRunning === true,
      contextState: status?.audioContextState ?? null,
      lifecycleState: status?.lifecycleState ?? null,
      capturedAt: now,
      intervalMs: previousAt === null ? null : Math.max(0, now - previousAt),
    };
  }

  class PointCloudsKesshoController {
    constructor(options) {
      if (!options || !options.engineFrame) {
        throw new TypeError('PointCloudsKessho.create requires an engineFrame iframe.');
      }
      this.engineFrame = options.engineFrame;
      this.presetId = typeof options.presetId === 'string' && options.presetId.trim()
        ? options.presetId.trim()
        : DEFAULT_PRESET_ID;
      this.overrides = copyObject(options.overrides);
      this.onStatus = typeof options.onStatus === 'function' ? options.onStatus : null;
      this.onTelemetry = typeof options.onTelemetry === 'function' ? options.onTelemetry : null;
      this.phase = 'booting';
      this.error = null;
      this.bridge = null;
      this.bootPromise = null;
      this.startPromise = null;
      this.stopPromise = null;
      this.telemetryTimer = null;
      this.bootDeadline = null;
      this.frameLoadHandler = null;
      this.destroyed = false;
      this.previousTelemetry = null;
      this.previousTelemetryAt = null;
      this.snapshot = {
        phase: 'booting',
        presetId: this.presetId,
        presetName: this.presetId,
        morphAmount: 0,
        isRunning: false,
        lifecycleState: null,
        audioContextState: null,
        telemetry: normalizeTelemetry(null, null, null),
        raw: null,
        error: null,
      };
      this.handleReadyMessage = this.handleReadyMessage.bind(this);
      this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
      global.addEventListener?.('message', this.handleReadyMessage);
      global.document?.addEventListener?.('visibilitychange', this.handleVisibilityChange);
      this.emitStatus('booting');
    }

    emitStatus(phase, extra = {}) {
      if (this.destroyed) return;
      this.phase = phase;
      this.snapshot = {
        ...this.snapshot,
        phase,
        error: this.error,
        ...extra,
      };
      try {
        this.onStatus?.({
          phase,
          presetId: this.snapshot.presetId,
          presetName: this.snapshot.presetName,
          isRunning: this.snapshot.isRunning,
          error: this.error,
          snapshot: this.snapshot,
        });
      } catch {
        // A visual callback must not change Product Core lifecycle semantics.
      }
    }

    getBridge() {
      const candidates = [];
      try {
        candidates.push(this.engineFrame.contentWindow);
      } catch {
        // A cross-origin frame is not a supported Product Core bridge.
      }
      candidates.push(global);
      for (const candidate of candidates) {
        let bridge;
        try {
          bridge = candidate?.__pointCloudsKesshoBridge;
        } catch {
          // Browsers expose file:// iframes as opaque origins. Reading a
          // property from that WindowProxy raises SecurityError; report the
          // normal boot timeout/failure instead of leaking an exception.
          continue;
        }
        if (
          bridge &&
          typeof bridge.start === 'function' &&
          typeof bridge.stop === 'function' &&
          typeof bridge.getStatus === 'function' &&
          typeof bridge.listPresets === 'function' &&
          typeof bridge.setMorph === 'function'
        ) return bridge;
      }
      return null;
    }

    handleReadyMessage(event) {
      if (event?.data?.type !== 'point-clouds:kessho-ready') return;
      try {
        if (event.source && event.source !== this.engineFrame.contentWindow && event.source !== global) return;
      } catch {
        return;
      }
      this.resolveBridge();
    }

    resolveBridge() {
      if (this.destroyed) return null;
      const bridge = this.getBridge();
      if (!bridge) return null;
      this.bridge = bridge;
      return bridge;
    }

    ensureFrameSource() {
      if (global.location?.protocol === 'file:') {
        if (bootstrapEmbeddedEngineInParent()) return;
        // Prefer a regular sibling file over an opaque `about:srcdoc` frame.
        // Safari and Chromium can reject file:// subresources requested by an
        // opaque srcdoc document even though the same scripts load from a
        // regular local-file document. The generated HTML keeps the actual
        // Product Core bundles authoritative and avoids any audio substitute.
        const embeddedEngineUrl = resolveEmbeddedEngineDocumentUrl();
        if (embeddedEngineUrl) {
          this.engineFrame.src = embeddedEngineUrl;
          return;
        }
        if (!('srcdoc' in this.engineFrame)) {
          throw new Error('The Product Core engine iframe does not support srcdoc for direct file playback.');
        }
        this.engineFrame.srcdoc = createEmbeddedEngineSrcdoc();
        return;
      }
      let current = '';
      try {
        current = this.engineFrame.getAttribute?.('src') || this.engineFrame.src || '';
      } catch {
        current = '';
      }
      if (current && current !== 'about:blank') return;
      const engineUrl = resolveEngineUrl();
      if (!engineUrl) throw new Error('Unable to resolve the Product Core engine iframe URL.');
      this.engineFrame.src = engineUrl;
    }

    boot() {
      if (this.destroyed) return Promise.reject(new Error('Point Clouds controller has been destroyed.'));
      if (this.bridge || this.resolveBridge()) {
        this.emitStatus('ready');
        return Promise.resolve(this);
      }
      if (this.bootPromise) return this.bootPromise;
      this.error = null;
      this.emitStatus('booting');
      this.bootPromise = new Promise((resolve, reject) => {
        let settled = false;
        let probe = null;
        const settle = (error, value) => {
          if (settled) return;
          settled = true;
          if (this.bootDeadline !== null) clearTimeout(this.bootDeadline);
          if (probe !== null) clearInterval(probe);
          if (this.frameLoadHandler) {
            this.engineFrame.removeEventListener?.('load', this.frameLoadHandler);
            this.frameLoadHandler = null;
          }
          this.bootDeadline = null;
          this.bootPromise = null;
          if (error) {
            this.error = errorMessage(error);
            this.emitStatus('failed');
            reject(error);
          } else {
            this.error = null;
            this.emitStatus('ready');
            resolve(value);
          }
        };
        try {
          this.ensureFrameSource();
        } catch (error) {
          settle(error);
          return;
        }
        const probeBridge = () => {
          const bridge = this.resolveBridge();
          if (bridge) settle(null, this);
        };
        probe = setInterval(probeBridge, 80);
        this.bootDeadline = setTimeout(() => {
          settle(new Error(
            global.location?.protocol === 'file:'
              ? 'Product Core embedded file:// bundle could not boot. Regenerate point-clouds/shared/embedded assets and inspect the iframe console.'
              : 'Timed out waiting for the Product Core engine iframe.',
          ));
        }, DEFAULT_ENGINE_TIMEOUT_MS);
        this.frameLoadHandler = probeBridge;
        this.engineFrame.addEventListener?.('load', this.frameLoadHandler);
        probeBridge();
      });
      return this.bootPromise;
    }

    readStatus() {
      const bridge = this.resolveBridge() ?? this.bridge;
      if (!bridge) throw new Error('Product Core engine is not ready.');
      const status = bridge.getStatus();
      if (!status || typeof status !== 'object') throw new Error('Product Core returned an invalid status.');
      return status;
    }

    updateSnapshot(status, normalized = null, notify = true) {
      const telemetry = normalized ?? normalizeTelemetry(status, this.previousTelemetry, this.previousTelemetryAt);
      this.previousTelemetry = telemetry;
      this.previousTelemetryAt = telemetry.capturedAt;
      this.snapshot = {
        ...this.snapshot,
        presetId: typeof status?.presetId === 'string' ? status.presetId : this.snapshot.presetId,
        presetName: typeof status?.presetName === 'string' ? status.presetName : this.snapshot.presetName,
        morphAmount: clamp01(status?.morphAmount),
        isRunning: status?.isRunning === true,
        lifecycleState: status?.lifecycleState ?? null,
        audioContextState: status?.audioContextState ?? null,
        telemetry,
        raw: status,
      };
      if (notify) {
        try {
          this.onTelemetry?.(telemetry, this.snapshot);
        } catch {
          // Keep polling even when a canvas callback throws.
        }
      }
      return this.snapshot;
    }

    pollTelemetry() {
      if (this.destroyed || this.phase !== 'playing') return;
      if (global.document?.hidden) return;
      try {
        const status = this.readStatus();
        this.updateSnapshot(status);
      } catch (error) {
        this.error = errorMessage(error);
        this.emitStatus('failed');
        this.stopTelemetryPolling();
        return;
      }
      this.telemetryTimer = setTimeout(() => {
        this.telemetryTimer = null;
        this.pollTelemetry();
      }, TELEMETRY_INTERVAL_MS);
    }

    startTelemetryPolling() {
      if (this.telemetryTimer !== null || this.destroyed || this.phase !== 'playing') return;
      this.pollTelemetry();
    }

    stopTelemetryPolling() {
      if (this.telemetryTimer === null) return;
      clearTimeout(this.telemetryTimer);
      this.telemetryTimer = null;
    }

    handleVisibilityChange() {
      if (this.destroyed) return;
      if (global.document?.hidden) {
        this.stopTelemetryPolling();
      } else if (this.phase === 'playing') {
        this.startTelemetryPolling();
      }
    }

    async waitForStatus(predicate, timeoutMs, description) {
      const deadline = Date.now() + timeoutMs;
      while (!this.destroyed && Date.now() <= deadline) {
        const status = this.readStatus();
        this.updateSnapshot(status);
        if (predicate(status)) return status;
        await sleep(40);
      }
      throw new Error(`Product Core did not reach ${description}.`);
    }

    async start() {
      if (this.destroyed) throw new Error('Point Clouds controller has been destroyed.');
      if (this.phase === 'playing') return this.getSnapshot();
      if (this.startPromise) return this.startPromise;
      this.startPromise = (async () => {
        // If boot() was completed before the user gesture, this branch calls
        // bridge.start synchronously before its first await. Product Core then
        // performs its own AudioContext priming in that same gesture.
        if (!this.bridge && !this.resolveBridge()) await this.boot();
        const bridge = this.resolveBridge() ?? this.bridge;
        if (!bridge) throw new Error('Product Core engine is not ready.');
        const presets = normalizePresetList(bridge.listPresets());
        if (!presets.some((preset) => preset.id === this.presetId)) {
          throw new Error(`Unknown Point Clouds preset: ${this.presetId}`);
        }
        this.error = null;
        this.emitStatus('loading');
        const startResult = bridge.start(this.presetId, this.overrides);
        await Promise.resolve(startResult);
        const status = await this.waitForStatus(isRunningStatus, RUNNING_TIMEOUT_MS, 'a running transport/audio context');
        this.error = null;
        this.updateSnapshot(status);
        this.emitStatus('playing');
        this.startTelemetryPolling();
        return this.getSnapshot();
      })().catch((error) => {
        this.error = errorMessage(error);
        this.stopTelemetryPolling();
        this.emitStatus('failed');
        throw error;
      }).finally(() => {
        this.startPromise = null;
      });
      return this.startPromise;
    }

    async stop() {
      if (this.destroyed) return this.getSnapshot();
      if (this.stopPromise) return this.stopPromise;
      this.stopPromise = (async () => {
        if (this.startPromise) {
          try {
            await this.startPromise;
          } catch {
            // Continue to request a stop after a failed start; the Product
            // Core bridge remains the authority for whether it was running.
          }
        }
        const bridge = this.resolveBridge() ?? this.bridge;
        if (!bridge) {
          this.stopTelemetryPolling();
          this.emitStatus('ready');
          return this.getSnapshot();
        }
        this.error = null;
        this.emitStatus('stopping');
        const stopResult = bridge.stop();
        await Promise.resolve(stopResult);
        const status = await this.waitForStatus(isStoppedStatus, STOPPED_TIMEOUT_MS, 'a stopped Product Core runtime');
        this.stopTelemetryPolling();
        this.error = null;
        this.updateSnapshot(status);
        this.emitStatus('ready');
        return this.getSnapshot();
      })().catch((error) => {
        this.error = errorMessage(error);
        this.emitStatus('failed');
        throw error;
      }).finally(() => {
        this.stopPromise = null;
      });
      return this.stopPromise;
    }

    toggle() {
      return this.phase === 'playing' ? this.stop() : this.start();
    }

    setMorph(amount) {
      if (!Number.isFinite(Number(amount)) || Number(amount) < 0 || Number(amount) > 1) {
        throw new RangeError('Point Clouds morph must be a finite number between 0 and 1.');
      }
      const bridge = this.resolveBridge() ?? this.bridge;
      if (!bridge) throw new Error('Product Core engine is not ready.');
      bridge.setMorph(Number(amount));
      this.snapshot = { ...this.snapshot, morphAmount: Number(amount) };
      return this.snapshot.morphAmount;
    }

    listPresets() {
      const bridge = this.resolveBridge() ?? this.bridge;
      if (!bridge) return [];
      return normalizePresetList(bridge.listPresets());
    }

    getSnapshot() {
      if (!this.destroyed) {
        try {
          const bridge = this.resolveBridge() ?? this.bridge;
          if (bridge) this.updateSnapshot(this.readStatus(), null, false);
        } catch {
          // Keep the last known snapshot; polling/start/stop report failures.
        }
      }
      return this.snapshot;
    }

    destroy() {
      if (this.destroyed) return;
      const bridge = this.resolveBridge() ?? this.bridge;
      if (bridge && this.snapshot.isRunning) {
        try {
          // Destruction is synchronous by contract; Product Core's stop is
          // still requested and its own lifecycle remains authoritative.
          void bridge.stop();
        } catch {
          // No callback or synthetic stopped state is emitted after destroy.
        }
      }
      this.destroyed = true;
      this.stopTelemetryPolling();
      if (this.bootDeadline !== null) clearTimeout(this.bootDeadline);
      this.bootDeadline = null;
      if (this.frameLoadHandler) {
        this.engineFrame.removeEventListener?.('load', this.frameLoadHandler);
        this.frameLoadHandler = null;
      }
      global.removeEventListener?.('message', this.handleReadyMessage);
      global.document?.removeEventListener?.('visibilitychange', this.handleVisibilityChange);
      this.onStatus = null;
      this.onTelemetry = null;
      this.bridge = null;
    }
  }

  global.PointCloudsKessho = {
    inputLibrary: VISUAL_INPUT_LIBRARY,
    getInputLibrary() {
      return VISUAL_INPUT_LIBRARY;
    },
    create(options) {
      return new PointCloudsKesshoController(options);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
