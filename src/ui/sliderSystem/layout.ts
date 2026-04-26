import type {
  SliderPrimitiveSurface,
  SliderVariant,
  SliderViewport,
} from './types';

export function resolveSliderViewport(isMobile: boolean): SliderViewport {
  return isMobile ? 'mobile' : 'desktop';
}

export function resolveSliderPrimitiveSurface(
  viewport: SliderViewport,
  variant: SliderVariant,
): SliderPrimitiveSurface {
  if (viewport === 'mobile') {
    return {
      viewport,
      variant,
      density: 'comfortable',
      matrixPresentation: variant === 'matrix' ? 'cards' : null,
    };
  }

  return {
    viewport,
    variant,
    density: 'compact',
    matrixPresentation: variant === 'matrix' ? 'grid' : null,
  };
}
