import { useEffect, useRef, useState } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { createPoem, seedIfNeeded } from './db/db';
import { FeatherProvider, useFeather } from './components/Feather';
import { Navigation } from './components/ui';
import { ToastCtx, useSettings, useToasts } from './lib/hooks';
import { Home } from './screens/Home';
import { EditorScreen } from './screens/Editor';
import { Books, BookDetail } from './screens/Books';
import { Lienzo, LienzoPicker } from './screens/Lienzo';
import { Ajustes } from './screens/Ajustes';
import plumaImg from './assets/pluma.png';

const THEME_COLOR = { plata: '#f3f5f9', papel: '#f4efe4', noche: '#070a12', tinta: '#0b0a1a' } as const;

export function App() {
  const [settings] = useSettings();
  const { items, push } = useToasts();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedIfNeeded()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[settings.theme]);
  }, [settings.theme]);

  return (
    <ToastCtx.Provider value={push}>
      <FeatherProvider animation={settings.animation}>
        <Router hook={useHashLocation}>
          <Shell ready={ready} />
        </Router>
        <div className="toasts" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className="toast">
              {t.msg}
            </div>
          ))}
        </div>
      </FeatherProvider>
    </ToastCtx.Provider>
  );
}

function Shell({ ready }: { ready: boolean }) {
  const [loc, navigate] = useLocation();
  const feather = useFeather();
  const [splash, setSplash] = useState<'on' | 'fade' | 'off'>('on');
  const prev = useRef(loc);

  // Pantalla de carga: la pluma gira al menos un momento mientras se abre el cuaderno.
  useEffect(() => {
    feather.setMode('splash');
    const min = new Promise((r) => setTimeout(r, feather.enabled ? 1400 : 600));
    let alive = true;
    min.then(() => {
      if (!alive) return;
      setSplash('fade');
      setTimeout(() => alive && setSplash('off'), 500);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al terminar la carga la pluma vuela a su sitio en Inicio; en otras pantallas se retira.
  useEffect(() => {
    if (splash === 'fade' && loc !== '/') feather.setMode('hidden');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splash]);

  // Transición entre secciones (no al teclear dentro del mismo poema).
  useEffect(() => {
    const seccion = (p: string) => p.split('/')[1] ?? '';
    if (seccion(prev.current) !== seccion(loc)) feather.transition();
    prev.current = loc;
    window.scrollTo(0, 0);
  }, [loc, feather]);

  const escribir = async () => navigate(`/escribir/${await createPoem()}`);
  const enEditor = loc.startsWith('/escribir');

  return (
    <>
      <div className="shell">
        {ready && splash !== 'on' && (
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/escribir/:id">{(p) => <EditorScreen key={p.id} id={p.id} />}</Route>
            <Route path="/libros" component={Books} />
            <Route path="/libros/:id">{(p) => <BookDetail key={p.id} id={p.id} />}</Route>
            <Route path="/lienzo" component={LienzoPicker} />
            <Route path="/lienzo/:id">{(p) => <Lienzo key={p.id} id={p.id} />}</Route>
            <Route path="/ajustes" component={Ajustes} />
            <Route>
              <Home />
            </Route>
          </Switch>
        )}
      </div>
      {splash !== 'on' && <Navigation onWrite={escribir} sinBarraInferior={enEditor} />}
      {splash !== 'off' && (
        <div className={`splash ${splash === 'fade' ? 'fade' : ''}`} aria-label="Cargando Pluma Plateada" role="status">
          {!feather.enabled && <StaticFeather />}
          <div className="name">Pluma Plateada</div>
          <div className="bar">
            <div />
          </div>
          <div className="eyebrow">Abriendo tu cuaderno</div>
        </div>
      )}
    </>
  );
}

function StaticFeather() {
  return <img className="splash-feather-static" src={plumaImg} alt="" />;
}
