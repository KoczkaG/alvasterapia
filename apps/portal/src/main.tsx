import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { OpeningAdmin } from './OpeningAdmin';
import './styles.css';

/**
 * Egyszerű nézetválasztás query paraméter alapján:
 *   ?view=opening-admin  → nyitvatartási naptár admin (I/B)
 *   (alapértelmezett)    → páciens adatlap (I/A)
 * Később kiváltható egy teljes értékű routerrel.
 */
function Root() {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'opening-admin') return <OpeningAdmin />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
