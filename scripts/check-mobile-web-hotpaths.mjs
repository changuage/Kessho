#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = (file) => readFileSync(resolve(root, file), 'utf8');

const checks = [];
function assert(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

const leadEditor = read('src/ui/synth/Lead4opFMEditorOverlay.tsx');
const sliderHelp = read('src/ui/SliderHelpOverlay.tsx');
const synthPage = read('src/ui/synth/SynthPage.tsx');
const simplePhraseVisualizer = read('src/ui/synth/SimplePhraseVisualizer.tsx');
const delayPage = read('src/ui/delay/DelayPage.tsx');
const delayRhythmMap = read('src/ui/delay/DelayRhythmMap.tsx');
const delayCss = read('src/ui/delay/delay.css');
const optionalVisualizerGateCss = read('src/ui/components/optionalVisualizerGate.css');
const ratingStars = read('src/presets/PresetRatingStars.tsx');
const presetDropdown = read('src/presets/PresetDropdown.tsx');
const presetFamilyTree = read('src/presets/PresetFamilyTree.tsx');
const drumPresetManager = read('src/ui/drums/DrumPresetManager.tsx');
const synthPresetManager = read('src/ui/synth/SynthPresetManager.tsx');
const earthPage = read('src/ui/earth/EarthPage.tsx');
const synthCss = read('src/ui/synth/synth.css');
const coreProductRuntime = read('src/audio/coreProductRuntime.ts');
const coreProductEvents = read('src/audio/coreProductEvents.ts');
const modulationRangeBridge = read('src/audio/product/host/CoreProductModulationRangeBridge.ts');
const runtimeSliderState = read('src/ui/runtimeSliderState.ts');
const runtimeWalkPositionSync = read('src/ui/runtimeWalkPositionSync.ts');
const telemetryRateLimits = read('src/ui/productRuntimeTelemetryRateLimits.ts');
const webProductEngine = read('src/audio/product/WebProductEngine.ts');
const worklet = read('public/worklets/kessho-core-product.worklet.js');

assert(
  leadEditor.includes('closeAuditionContext') &&
    leadEditor.includes("document.addEventListener('visibilitychange'") &&
    leadEditor.includes('if (!open || !sequencePlaying)') &&
    leadEditor.includes('openRef.current') &&
    leadEditor.includes('mutedSequenceStepsRef.current'),
  'Lead FM audition must stop/close audio and interval work when hidden or closed'
);

assert(
  !leadEditor.includes('[mutedSequenceSteps, playAuditionNote') &&
    !leadEditor.includes('[draft, nameDraft, original, sequencePlaying'),
  'Lead FM audition interval must not restart on every rating/edit state update'
);

assert(
  sliderHelp.includes("window.matchMedia('(max-width: 420px)'") &&
    sliderHelp.includes("window.matchMedia('(max-width: 600px)'") &&
    sliderHelp.includes("pointerEvents: 'auto'") &&
    sliderHelp.includes("touchAction: 'pan-y'") &&
    !sliderHelp.includes("addEventListener('resize'"),
  'Slider help mobile layout must use breakpoint listeners and allow touch scrolling'
);

assert(
  synthPage.includes('const leadPresetOptions = useMemo<LeadPresetOption[]>') &&
    synthPage.includes('const leadPresetOptionById = useMemo') &&
    synthPage.includes('const findLeadPresetOption = useCallback'),
  'Synth lead preset lookup structures must stay memoized'
);

assert(
  synthPage.includes("useVisualFeatureToggle(\n    'kessho.visualizers.synthSimple.chordGenerator.v2.enabled',\n    false") &&
    synthPage.includes("useVisualFeatureToggle(\n    'kessho.visualizers.synthSimple.randomTiming.v2.enabled',\n    false") &&
    synthPage.includes('simpleChordPhraseVizToggle.enabled') &&
    synthPage.includes('simpleRandomTimingVizToggle.enabled') &&
    synthPage.includes('<OptionalVisualizerGate'),
  'Synth simple phrase visualizers must stay opt-in and hidden by default'
);

assert(
  optionalVisualizerGateCss.includes('.optional-visualizer-hide-button {\n  min-height: 28px') &&
    optionalVisualizerGateCss.includes('font-size: 0.72rem') &&
    optionalVisualizerGateCss.includes('padding-block: 4px'),
  'Active visualizer hide control must stay compact'
);

assert(
  simplePhraseVisualizer.includes('getCappedCanvasDpr') &&
    simplePhraseVisualizer.includes('useAnimationVisibility') &&
    simplePhraseVisualizer.includes('if (!canAnimate) return') &&
    simplePhraseVisualizer.includes('if (!isRunning && !transitionRef.current)') &&
    !simplePhraseVisualizer.includes('Math.min(2, window.devicePixelRatio'),
  'Synth simple phrase visualizers must pause offscreen/stopped and use capped mobile DPR'
);

assert(
  synthPage.includes("const livePadFilterVizMounted = isSynthSourceCardExpanded('pad1') || isSynthSourceCardExpanded('pad2')") &&
    synthPage.includes('enabled: isRunning && liveSourceTelemetryAvailable && livePadFilterVizMounted'),
  'Synth live filter telemetry polling must only run while pad filter visualizers are mounted'
);

assert(
  delayPage.includes("useVisualFeatureToggle(\n    'kessho.visualizers.delayRhythmMap.enabled',\n    !isMobile") &&
    delayPage.includes('delayRhythmMapToggle.enabled') &&
    delayPage.includes('<OptionalVisualizerGate') &&
    delayPage.includes('Show rhythm map') &&
    delayPage.includes('<DelayRhythmMap'),
  'Delay rhythm map must stay hidden by default on mobile and opt-in through the visualizer gate'
);

assert(
  delayRhythmMap.includes('getCappedCanvasDpr') &&
    delayRhythmMap.includes('useAnimationVisibility') &&
    delayRhythmMap.includes('const shouldAnimate = canAnimate && hasAnimatedContent') &&
    delayRhythmMap.includes('if (shouldAnimate)') &&
    delayCss.includes('.delay-root.mobile .delay-rhythm-map,') &&
    delayCss.includes('.delay-root.mobile .delay-card-body > .optional-visualizer-placeholder'),
  'Delay rhythm map must keep capped DPR, offscreen pause, and mobile placeholder sizing'
);

assert(
  ratingStars.includes('React.memo(function PresetRatingStars') &&
    ratingStars.includes("hitSize = '1.5rem'") &&
    ratingStars.includes("minWidth: '24px'") &&
    ratingStars.includes('aria-pressed={currentValue === rating}') &&
    ratingStars.includes("touchAction: 'manipulation'") &&
    ratingStars.includes('RATING_VALUES.map'),
  'Preset rating stars must stay memoized with touch-friendly tap handling'
);

assert(
  synthPage.includes('renderLeadPresetLoader') &&
    synthCss.includes('min-height: 28px') &&
    synthCss.includes('flex: 0 0 38px'),
  'Synth lead editor controls must keep mobile-friendly touch target floors'
);

assert(
  [
    presetDropdown,
    presetFamilyTree,
    drumPresetManager,
    synthPresetManager,
    earthPage,
    synthPage,
  ].every(source => source.includes('catch (ratingError)')),
  'Preset rating writes must catch failures before updating local rating state'
);

assert(
  !coreProductRuntime.includes('String(Date.now())'),
  'Core Product runtime asset version must be content-hash based, not Date.now based.'
);

assert(
  !coreProductRuntime.includes("cache: 'no-store'") && !coreProductRuntime.includes('cache: "no-store"'),
  'Core Product WASM first fetch must be browser-cacheable; retries may use reload.'
);

assert(
  coreProductRuntime.includes("cache: attempt > 0 ? 'reload' : 'default'"),
  'Core Product WASM fetch must use default browser cache first and reload only retries.'
);

assert(
  coreProductRuntime.includes('syncTelemetryLoop') &&
    coreProductRuntime.includes('requestTelemetryOnce') &&
    coreProductRuntime.includes('visibility-resume'),
  'Core Product runtime must gate telemetry and request one telemetry sync on visibility resume.'
);

assert(
  coreProductRuntime.includes('const CORE_PRODUCT_TELEMETRY_DESKTOP_INTERVAL_MS = 250') &&
    coreProductRuntime.includes('const CORE_PRODUCT_TELEMETRY_MOBILE_INTERVAL_MS = 500') &&
    coreProductRuntime.includes('const CORE_PRODUCT_VISUAL_TELEMETRY_DESKTOP_INTERVAL_MS = 33') &&
    coreProductRuntime.includes('const CORE_PRODUCT_VISUAL_TELEMETRY_MOBILE_INTERVAL_MS = 67'),
  'Core Product runtime must have slower mobile telemetry/visual telemetry cadence.'
);

assert(
  coreProductRuntime.includes('return this.telemetryPollingEnabled && this.transportRunningForTelemetry && this.isDocumentVisible();'),
  'Core Product recurring telemetry must require callback registration, running transport, and visible document.'
);

assert(
  coreProductRuntime.includes("document.addEventListener('visibilitychange', this.handleVisibilityChange)") &&
    coreProductRuntime.includes("document.removeEventListener('visibilitychange', this.handleVisibilityChange)"),
  'Core Product runtime must cleanly bind/unbind visibility resume telemetry sync.'
);

assert(
  modulationRangeBridge.includes('CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk') &&
    modulationRangeBridge.includes('runtimeWalkValues') &&
    modulationRangeBridge.includes('publishRuntimeWalkPositions'),
  'Runtime walk positions must be Product Core telemetry-backed and publishable on visible resume.'
);

assert(
  !runtimeWalkPositionSync.includes('requestAnimationFrame(') &&
    !runtimeWalkPositionSync.includes('setInterval(') &&
    !runtimeWalkPositionSync.includes('setTimeout('),
  'runtimeWalkPositionSync must not advance audible walk/sampleHold values from UI timers.'
);

assert(
  !runtimeSliderState.includes('Math.random()') &&
    !runtimeSliderState.includes('Date.now()') &&
    !runtimeSliderState.includes('performance.now()'),
  'runtimeSliderState must remain a UI mirror, not a random-walk clock/source.'
);

assert(
  coreProductEvents.includes('sampleHold') && coreProductEvents.includes('randomWalk'),
  'Product event layer must retain sampleHold/randomWalk modulation range modes.'
);

assert(
  telemetryRateLimits.includes('PRODUCT_RUNTIME_SLIDER_HZ'),
  'Runtime slider UI cadence must remain explicit and guardable.'
);

assert(
  coreProductRuntime.includes('isIOSLikeDevice()') &&
    coreProductRuntime.includes('outputChannelCount: [2]'),
  'iOS Product worklet must instantiate stereo output directly.'
);

assert(
  worklet.includes("message.type === 'events'") || worklet.includes('message.type === "events"'),
  'Product worklet must accept ordered event batches.'
);

assert(
  webProductEngine.includes('postEvents(events)') &&
    !webProductEngine.includes('for (const event of events) {\n      coreProductRuntimeHostPort.postEvent(event);\n    }'),
  'WebProductEngine.enqueueEvents must use the batched Product runtime host port.'
);

const failed = checks.filter(check => !check.ok);
if (failed.length > 0) {
  for (const failure of failed) {
    console.error(`Mobile web hotpath check failed: ${failure.message}`);
  }
  process.exit(1);
}

console.log('Mobile web hotpath checks passed');
