# Product Core Web Audio Graph Parity

This is the proof design for full `web-ts` versus `core-product` graph parity. Module parity is necessary but not sufficient: the migration is only complete when the same source signals feed the same buses, the same bus processors run in the same order, and the same master output is produced within declared tolerances.

## Success Criteria

- Every domain in `docs/kessho-product-web-audio-graph-parity.manifest.json` has status `proven`.
- Web and Product Core expose matched capture boundaries for source dry outputs, source sends, FX inputs/outputs, dynamics input/output, master pre-limiter, and master post-limiter.
- Focused corpus cases compare those boundaries, not only the final master.
- Full-scene corpus cases compare aligned master output after boundary parity is established.
- `npm run core:product:web-graph-parity:strict` passes and is included in the Product Core CI path.

## Prompt-To-Artifact Checklist

| Requirement | Artifact | Current status |
| --- | --- | --- |
| Granular graph parity, including sends and processing | Manifest domain `granular`; `granularInput` smoke case plus Product output/send taps | Partial |
| Spectral freeze Web Audio graph parity | Manifest domain `spectralFreeze`; pre/post-route `spectralFreezeInput`/`spectralFreezeOutput` smoke cases | Partial |
| Diffuse/source spatial send parity | Manifest domain `diffuseSourceSpatial`; diffuse source-send/input/output/reverb graph taps plus browser smoke cases | Partial |
| Soundscape layer parity | Manifest domain `soundscapeLayers`; per-layer Web/Product capture taps, deterministic nature/ocean/water/insects dry/send browser smoke, nature/ocean/water/insects/combined master scenes, plus Product graph coverage | Partial |
| Delay A/B routing parity | Manifest domain `delayAB`; Delay A output/reverb/cross/granular-send, Delay B input/output/send, and bidirectional safe-crossfeed smoke cases | Partial |
| Reverb macro/context parity | Manifest domain `reverbMacro`; `reverbInput`, `reverbPreconditionerOut`, `reverbReturn`, and tension/scale-shimmer return smoke cases | Partial |
| Drum/source send parity | Manifest domain `drumSourceSends`; drum, pad-1/pad-2, lead-1/lead-2, and deterministic regular-sample piano dry/reverb/Delay A/Delay B/granular send smoke cases | Partial |
| Dynamics/sidechain/master parity | Manifest domain `dynamicsSidechainMaster`; active `dynamicsInput`/`dynamicsOutput`, pad-1 sidechain input/output/gain trace, plus master pre/post limiter smoke cases | Partial |
| Tests compare matched bus boundaries and full master | `matchedBoundaryPolicy` in the manifest; focused boundary smoke plus master corpus | Partial |

## Gate Semantics

## Current Missing Parity

The engines still missing Web Audio graph parity fall into two groups:

- Matched capture boundaries now exist for every named domain, but no domain has enough focused boundary comparisons plus full-scene master proof to be marked `proven`.
- Boundary smoke exists and a first master-output corpus exists, but strict parity is not proven: granular, spectral freeze, diffuse/source spatial sends, Delay A/B, reverb macro/context shaping, drum/source sends, dynamics/sidechain/master.
- Soundscape layer boundaries, Product per-layer route values, aggregate nature send capture, deterministic single-layer nature/ocean/water/insects dry and reverb/Delay A/Delay B/granular-send smoke coverage, and deterministic nature/ocean/water/insects/combined dry master scenes exist, but strict production parity is not proven because Web/Product texture-player timing/random-start policy is still only bypassed by the fixture and broader production/full-scene combinations remain open.

The granular engine is no longer missing its first-order Web graph wiring proof: input, clean output, reverb send, and Delay A/B sends all have focused browser smoke coverage. It remains partial because multi-voice modulation, feedback/freeze/cloud cases, and full-scene master output are not yet in the strict corpus.

`npm run core:product:web-graph-parity:audit` verifies that the parity manifest names every required domain, references real source evidence, and records blockers for anything not proven.

`npm run core:product:web-graph-capture-smoke` runs browser-level matched-boundary comparisons against `reverbInput`, `reverbPreconditionerOut`, `reverbReturn`, tension/scale-shimmer `reverbReturn`, pre/post-route `spectralFreezeInput`/`spectralFreezeOutput`, timed active-freeze `pad1Dry`/`spectralFreezeOutput`/`masterPostLimiter`, pad-1/pad-2/lead-1/lead-2/piano dry/send taps including diffuse sends, `diffuseInput`, `diffuseOutput`, `diffuseReverbSend`, deterministic soundscape `natureDry`/`natureReverbSend`/`natureDelayASend`/`natureDelayBSend`/`natureGranularSend`, ocean `oceanDry`/`oceanReverbSend`/`oceanDelayASend`/`oceanDelayBSend`/`oceanGranularSend`, water `waterDry`/`waterReverbSend`/`waterDelayASend`/`waterDelayBSend`/`waterGranularSend`, insects `insectsDry`/`insectsReverbSend`/`insectsDelayASend`/`insectsDelayBSend`/`insectsGranularSend`, insects2 dry output, `granularInput`, deterministic clean-mode `granularOutput`, `granularReverbSend`, granular-to-Delay A/B sends, Delay A output/send taps including bidirectional safe-crossfeed cases, Delay B input/output/send taps, active `dynamicsInput`/`dynamicsOutput`, pad-1 `sidechainPad1Input`/`sidechainPad1Output`/`sidechainPad1GainTrace`, `masterPreLimiter`, and `masterPostLimiter`. The current smoke suite passes 93 focused boundary cases. This is a capture-path regression test, not full graph parity.

`npm run core:product:web-master-corpus` runs browser-level full-output comparisons at `masterPostLimiter` for fourteen focused scenes: basic reverb, tension/scale-shimmer reverb, clean granular, live pre-route spectral freeze, pad diffuse, Delay A/B feedback, dynamics character, drum kick, pad/kick sidechain, deterministic ocean dry soundscape, deterministic nature dry soundscape, deterministic water dry soundscape, deterministic insects dry soundscape, and deterministic combined water/insects dry soundscape. This closes the first master-output proof layer, but it is not yet the strict sign-off corpus for all stateful and production cases.

`npm run core:product:web-graph-parity:strict` is the future release gate. It must fail until every domain is marked `proven`, has matched boundary evidence, and has no blockers.

The audit gate is intentionally not a parity sign-off. It is a guard against treating module parity, smoke tests, or broad master-only RMS checks as proof of full Web Audio graph parity.

Product Core exposes the native boundary capture surface through `kessho_product_get_graph_tap()`. Current taps cover shared FX inputs, pad-1/pad-2/lead-1/lead-2/piano dry and pre-fader sends including diffuse sends, diffuse input/output/reverb send, soundscape ocean/water/insects/nature dry and layer send taps, the aggregate soundscape stem, Delay A/B outputs and sends, granular output and sends, reverb input/preconditioner/return, spectral freeze input/output, dynamics input/output, and master pre/post limiter.

The browser harness can now request the same named graph tracks from both runtimes. Web captures use named `AudioNode` taps such as `reverbInput`, `reverbPreconditionerOut`, `spectralFreezeInput`, `spectralFreezeOutput`, `pad1Dry`, `pad1ReverbSend`, `pad1DelayASend`, `pad1DelayBSend`, `pad1GranularSend`, `pad1DiffuseSend`, `pad2Dry`, `pad2ReverbSend`, `pad2DelayASend`, `pad2DelayBSend`, `pad2GranularSend`, `pad2DiffuseSend`, `lead1Dry`, `lead1ReverbSend`, `lead1DelayASend`, `lead1DelayBSend`, `lead1GranularSend`, `lead1DiffuseSend`, `lead2Dry`, `lead2ReverbSend`, `lead2DelayASend`, `lead2DelayBSend`, `lead2GranularSend`, `lead2DiffuseSend`, `pianoDry`, `pianoReverbSend`, `pianoDelayASend`, `pianoDelayBSend`, `pianoGranularSend`, `pianoDiffuseSend`, `diffuseInput`, `diffuseOutput`, `diffuseReverbSend`, `oceanDry`, `waterDry`, `insectsDry`, `natureDry`, `oceanReverbSend`, `waterReverbSend`, `insectsReverbSend`, `natureReverbSend`, `oceanDelayASend`, `waterDelayASend`, `insectsDelayASend`, `natureDelayASend`, `oceanDelayBSend`, `waterDelayBSend`, `insectsDelayBSend`, `natureDelayBSend`, `oceanGranularSend`, `waterGranularSend`, `insectsGranularSend`, `natureGranularSend`, `soundscapeStem`, `delayAOut`, `delayAReverbSend`, `delayAToDelayBSend`, `delayAToGranularSend`, `delayBInput`, `delayBOut`, `delayBReverbSend`, `delayBToDelayASend`, `delayBToGranularSend`, `granularInput`, `dynamicsInput`, `dynamicsOutput`, `masterPreLimiter`, and `masterPostLimiter`; Product captures stream graph-tap buffers from the worklet for those same names. This proves the capture plumbing exists, but not sonic parity by itself. The strict corpus still has to compare focused boundary buffers plus full master output before any domain can move to `proven`.

The first diffuse/source-spatial blocker is fixed: Web exposes diffuse bus/send capture nodes, Product Core carries `SourceDiffuseSend`, routes post-level/post-width source diffuse sends through the diffuse HPF/LPF/Haas-like return, exposes graph taps for diffuse input/output/reverb send and each source diffuse send, and focused smoke plus a pad diffuse master scene pass. Remaining diffuse blockers are exact browser `StereoPannerNode`/Haas parity, broader all-source distance/modulated scenes, and all-source full-scene master proof.

The first soundscape blockers are fixed: Web exposes ocean/water/insects/nature dry and send capture nodes, Web nature send capture now aggregates birds/birds2/frogs, Product Core exports matching per-layer graph taps plus the aggregate soundscape stem, and Product Core now carries per-layer route values for combined scenes instead of collapsing routes through a single max send. Product Core also treats ocean sends as Web-style pre-fader sends while keeping the dry path level-scaled, and no longer decodes unused water/insects sample assets when those layers are module-backed. Deterministic fixture coverage now proves nature, ocean, water, and insects dry/reverb/Delay A/Delay B/granular-send boundaries, plus insects2 dry output and nature/ocean/water/insects/combined water-insects dry master scenes. Remaining soundscape blockers are production Web/Product texture timing and random-start policy alignment for non-fixture scenes and broader production corpus coverage.

The first granular branch blocker is fixed: Product Core no longer resets its whole runtime during manual parity triggers, `granularMix` / `granularToReverb` can carry Web's `ENGINE_TRIMS.granular` range instead of clamping at 1.0, and the Product granular branch now exposes Web's macro-shaped output/reverb LPFs plus the WebAudio reverb-send compressor makeup. Deterministic clean-mode `granularOutput`, `granularReverbSend`, granular-to-Delay A/B, and clean granular master cases now pass. Remaining granular blockers are broader multi-voice, modulated, feedback/freeze, and legacy cloud corpus cases.

The first dynamics branch blocker is fixed: Product Core now applies master gain before the dynamics chain to match Web's `masterGain` placement, feeds the shared dynamics-character module with the Web `resolveDynamicsTargets` parameter model, and exposes a targeted parity FX reset for dynamics state instead of resetting the full runtime. Active-character `dynamicsInput`, `dynamicsOutput`, and active-character master cases now pass.

The first sidechain blocker is fixed: Web now exposes sidechain pad-1 input/output and a diagnostic gain-trace node driven by the same dry/duck gain automation, Product Core exports matching graph taps, and the Product sidechain envelope uses Web-style linear attack plus `setTargetAtTime`-style release for the exercised kick-to-pad path. `sidechainPad1Input`, `sidechainPad1Output`, `sidechainPad1GainTrace`, and pad/kick sidechain master cases now pass. Remaining dynamics blockers are broader sidechain target coverage and saturation/end-compressor corpus coverage.

The first drum/source-send blocker is fixed: Web drum triggers now route to the active drum WASM node when it is ready, Web exposes drum dry/reverb/Delay A/Delay B/granular send capture nodes, Product Core exports matching drum graph taps, and Product drum triggers preserve per-voice morph/distance defaults instead of forcing generic source defaults into the drum module. `drumDry`, `drumReverbSend`, `drumDelayASend`, `drumDelayBSend`, `drumGranularSend`, and a drum kick master scene now pass. Product Core also exposes pad-1, pad-2, lead-1, lead-2, piano, and deterministic water/insects dry/reverb/Delay A/Delay B/granular send taps, Web exposes matching capture nodes, and those smoke cases pass. Piano parity is currently proven for the deterministic regular-sample path: Product Core uses Web-like ADSHR, splits piano sends at the pre-fader bus boundary, applies the 24 dB post-LPF dry path, and trims only the dry capture/output path. Remaining source-send blockers are Web's short piano sample variant, production soundscape sends, and full master corpus proof for more source-send scenes.

The first spectral-freeze graph-placement blocker is fixed: Product Core no longer freezes the full master buffer before dynamics. It now routes spectral freeze inside the reverb branch, carries Web's pre/post routing and reverb crossfade through snapshot/live params, exposes Product graph taps for `spectralFreezeInput` and `spectralFreezeOutput`, and Web exposes matching capture nodes. Pre-route and post-route `spectralFreezeInput`, live-resynthesis `spectralFreezeOutput`, a timed active-freeze `pad1Dry` tap, a timed active-freeze `spectralFreezeOutput` tap, a timed active-freeze `masterPostLimiter` scene, and a live pre-route master scene now pass. Product Core applies the active-freeze pad dry attenuation at the audible dry mix while keeping the `pad1Dry` graph tap at the Web boundary. Remaining blockers are broader frozen/slushy stateful freeze coverage and stricter master pre/post limiter proof.

The first reverb-return blocker is fixed: `reverbInput`, `reverbPreconditionerOut`, `reverbReturn`, a tension/scale-shimmer reverb return, a basic reverb master scene, and a tension/scale-shimmer master scene now have focused Web/Product comparisons. Product Core resolves Web-style reverb tension and scale-shimmer params before the shared module. Reverb remains partial until the corpus covers Web's runtime harmony wash/bloom boosts, mobile quality override proof, and broader full-scene master proof.

The next Delay A/B blocker is partially fixed: Product Core now applies Web's bidirectional crossfeed safety scale during snapshot creation, applies a Product-only B-to-A trim for active bidirectional cycles, and carries the B-to-A crossfeed into Delay A on the next render quantum so the bidirectional loop can be exercised instead of being silently dropped by render order. Both bidirectional safe-crossfeed smoke cases and a feedback master scene pass, with the B-to-A case using explicit looser envelope-ratio tolerances. Delay A/B remains partial until longer feedback/order scenes outside the current corpus are proven.

## Test Shape

Each focused corpus case should render both runtimes from the same snapshot and compare:

- Source dry and pre-fader send buffers.
- FX input, direct output, and send taps.
- Dynamics input/output and sidechain gain traces.
- Master pre-limiter and post-limiter output.

Strict acceptance should use deterministic thresholds for C++/WASM module paths and explicitly looser thresholds only where the Web reference depends on browser-native nodes such as `DelayNode`, `BiquadFilterNode`, or `DynamicsCompressorNode`.
