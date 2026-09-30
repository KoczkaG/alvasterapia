import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CallPanel } from './CallPanel';
import { CallStatsView } from './CallStatsView';
import { OpeningAdmin } from './OpeningAdmin';
import { TimelineView } from './TimelineView';
import './styles.css';

/**
 * Egyszerű nézetválasztás query paraméter alapján:
 *   ?view=opening-admin  → nyitvatartási naptár admin (I/B)
 *   ?view=call-panel     → Click-to-Call pulti panel (I/C + I/E jegyzet)
 *   ?view=call-stats     → hívásstatisztika vezetői dashboard (I/E)
 *   ?view=timeline       → ügyféltörténet idővonal (I/D)
 *   (alapértelmezett)    → páciens adatlap (I/A)
 * Később kiváltható egy teljes értékű routerrel.
 */
function Root() {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'opening-admin') return <OpeningAdmin />;
  if (view === 'call-panel') return <CallPanel />;
  if (view === 'call-stats') return <CallStatsView />;
  if (view === 'timeline') return <TimelineView />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
