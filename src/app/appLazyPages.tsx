import React from 'react';

export const JourneyModeView = React.lazy(() => import('../ui/JourneyModeView'));
export const GlobalPage = React.lazy(() => import('../ui/global/GlobalPage'));
export const SynthPage = React.lazy(() => import('../ui/synth/SynthPage'));
export const ReverbPage = React.lazy(() => import('../ui/fxAlt/FxAltPages').then((module) => ({ default: module.ReverbVariantPage })));
export const DrumPage = React.lazy(() => import('../ui/drums/DrumPage'));
export const GranularPage = React.lazy(() => import('../ui/fxAlt/FxAltPages').then((module) => ({ default: module.GranularVariantPage })));
export const DelayPage = React.lazy(() => import('../ui/fxAlt/FxAltPages').then((module) => ({ default: module.DelayVariantPage })));
export const TexturePage = React.lazy(() => import('../ui/fxAlt/FxAltPages').then((module) => ({ default: module.TextureVariantPage })));
export const RoutingPage = React.lazy(() => import('../ui/routing/RoutingPage'));
export const EarthPage = React.lazy(() => import('../ui/earth/EarthPage'));
export const ReactiveVisualizerPage = React.lazy(() => import('../ui/visualizer/ReactiveVisualizerPage'));

export const LAZY_PAGE_FALLBACK = (
  <div style={{ padding: '24px', color: '#9ca3af', textAlign: 'center' }}>Loading...</div>
);
