import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BillingPanel } from './BillingPanel';
import { CallPanel } from './CallPanel';
import { CallStatsView } from './CallStatsView';
import { CompletenessPanel } from './CompletenessPanel';
import { EanPoolAdmin } from './EanPoolAdmin';
import { OpeningAdmin } from './OpeningAdmin';
import { SelfServicePage } from './SelfServicePage';
import { SettlementPanel } from './SettlementPanel';
import { TimelineView } from './TimelineView';
import './styles.css';

/**
 * Egyszerű nézetválasztás query paraméter alapján:
 *   ?view=opening-admin  → nyitvatartási naptár admin (I/B)
 *   ?view=call-panel     → Click-to-Call pulti panel (I/C + I/E jegyzet)
 *   ?view=call-stats     → hívásstatisztika vezetői dashboard (I/E)
 *   ?view=timeline       → ügyféltörténet idővonal (I/D)
 *   ?view=completeness   → „adatlap hiányos" pulti panel (I/F)
 *   ?view=self-service   → betegoldali önkiszolgáló adatpótlás (I/F, ?token=…)
 *   ?view=billing        → pulti számlázási védőháló (II/D + II/B EP)
 *   ?view=ean-pool       → EAN-kód pool admin (II/C)
 *   ?view=settlement     → elszámolás és statisztika (II/E)
 *   (alapértelmezett)    → páciens adatlap (I/A)
 * Később kiváltható egy teljes értékű routerrel.
 */
function Root() {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'opening-admin') return <OpeningAdmin />;
  if (view === 'call-panel') return <CallPanel />;
  if (view === 'call-stats') return <CallStatsView />;
  if (view === 'timeline') return <TimelineView />;
  if (view === 'completeness') return <CompletenessPanel />;
  if (view === 'self-service') return <SelfServicePage />;
  if (view === 'billing') return <BillingPanel />;
  if (view === 'ean-pool') return <EanPoolAdmin />;
  if (view === 'settlement') return <SettlementPanel />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
