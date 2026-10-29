import { useEffect, useState } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { memoryLocation } from 'wouter/memory-location';
import { createPoem, seedIfNeeded } from './db/db';
import { FeatherProvider, useFeather } from './components/Feather';
import { ConfirmProvider, Navigation } from './components/ui';
import { ToastCtx, useSettings, useToasts } from './lib/hooks';
import { Home } from './screens/Home';
import { EditorScreen } from './screens/Editor';
import { Books, BookDetail } from './screens/Books';
import { VistaLibro } from './screens/VistaLibro';
import { Lienzo, LienzoPicker } from './screens/Lienzo';
import { Ajustes } from './screens/Ajustes';
import { Intro } from './screens/Intro';

// Incrustada (p. ej. en un artefacto) el hash no es fiable: la navegación vive en memoria.
const ubicacion = window.self !== window.top ? memoryLocation({ path: '/' }).hook : useHashLocation;

const THEME_COLOR = { plata: '#f3f5f9', papel: '#f4efe4', noche: '#070a12', tinta: '#0b0a1a' } as const;

export function App() {
  const [settings, , cargados] = useSettings();
  const { items, push } = useToasts();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedIfNeeded()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.tema = settings.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[settings.theme]);
  }, [settings.theme]);

  return (
    <ToastCtx.Provider value={push}>
      <FeatherProvider animation={settings.animation}>
        <ConfirmProvider>
          <Router hook={ubicacion}>{cargados && <Shell ready={ready} bienvenida={settings.showIntro} />}</Router>
        </ConfirmProvider>
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

type Fase = 'bienvenida' | 'revelando' | 'lista';

function Shell({ ready, bienvenida }: { ready: boolean; bienvenida: boolean }) {
  const [loc, navigate] = useLocation();
  const feather = useFeather();
  const [fase, setFase] = useState<Fase>(bienvenida ? 'bienvenida' : 'lista');

  // Tras la bienvenida, la pluma se posa en Inicio; en otras pantallas se retira.
  useEffect(() => {
    if (fase !== 'bienvenida' && loc !== '/') feather.setMode('hidden');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc]);

  const escribir = async () => navigate(`/escribir/${await createPoem()}`);
  const enEditor = loc.startsWith('/escribir') || loc.endsWith('/vista');
  const seccion = loc.split('/')[1] ?? '';
  const mostrar = ready && fase !== 'bienvenida';

  return (
    <>
      <div className={`shell ${fase === 'revelando' ? 'revelar' : ''}`}>
        {mostrar && (
          // Cada sección entra con un fundido suave.
          <div key={seccion} className="ruta">
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/escribir/:id">{(p) => <EditorScreen key={p.id} id={p.id} />}</Route>
              <Route path="/libros" component={Books} />
              <Route path="/libros/:id">{(p) => <BookDetail key={p.id} id={p.id} />}</Route>
              <Route path="/libros/:id/vista">{(p) => <VistaLibro key={p.id} id={p.id} />}</Route>
              <Route path="/lienzo" component={LienzoPicker} />
              <Route path="/lienzo/:id/:salida?">{(p) => <Lienzo key={p.id} id={p.id} salida={p.salida} />}</Route>
              <Route path="/ajustes" component={Ajustes} />
              <Route>
                <Home />
              </Route>
            </Switch>
          </div>
        )}
      </div>
      {mostrar && <Navigation onWrite={escribir} sinBarraInferior={enEditor} />}
      {fase !== 'lista' && (
        <Intro
          ready={ready}
          onEntrar={() => {
            setFase('revelando');
            setTimeout(() => setFase('lista'), 1300);
          }}
        />
      )}
    </>
  );
}
