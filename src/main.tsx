import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import DiamondJourneyDemo from './ui/DiamondJourneyDemo';

// Check for ?demo=journey query parameter
const urlParams = new URLSearchParams(window.location.search);
const demoMode = urlParams.get('demo');

const RootComponent = demoMode === 'journey' ? DiamondJourneyDemo : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
