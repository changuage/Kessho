import type { ReactNode } from 'react';
import './optionalVisualizerGate.css';

type OptionalVisualizerGateProps = {
  enabled: boolean;
  title: string;
  description: string;
  enableLabel?: string;
  hideLabel?: string;
  onEnable: () => void;
  onHide?: () => void;
  children: ReactNode;
};

export function OptionalVisualizerGate({
  enabled,
  title,
  description,
  enableLabel = 'Enable visualizer',
  hideLabel = 'Hide visualizer',
  onEnable,
  onHide,
  children,
}: OptionalVisualizerGateProps) {
  if (!enabled) {
    return (
      <section className="optional-visualizer-placeholder" aria-live="polite">
        <div className="optional-visualizer-placeholder__text">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button
          type="button"
          className="optional-visualizer-placeholder__button"
          onClick={onEnable}
        >
          {enableLabel}
        </button>
      </section>
    );
  }

  return (
    <section className="optional-visualizer-active">
      {onHide ? (
        <div className="optional-visualizer-toolbar">
          <button
            type="button"
            className="optional-visualizer-hide-button"
            onClick={onHide}
          >
            {hideLabel}
          </button>
        </div>
      ) : null}
      {children}
    </section>
  );
}
