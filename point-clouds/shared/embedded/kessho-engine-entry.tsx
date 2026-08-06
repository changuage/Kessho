import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/App';

// This entry is bundled as one classic IIFE for the direct-file srcdoc frame.
// The parent bridge creates the hidden root and sets the engine-mode flag
// before loading the generated bundle, so App mounts the real Product Core
// bridge without rendering the main application UI.
const rootElement = document.getElementById('kessho-engine-root')
  ?? (() => {
    const element = document.createElement('div');
    element.id = 'kessho-engine-root';
    element.setAttribute('aria-hidden', 'true');
    element.style.cssText = 'width:1px;height:1px;overflow:hidden';
    document.body.appendChild(element);
    return element;
  })();

createRoot(rootElement).render(<App />);

