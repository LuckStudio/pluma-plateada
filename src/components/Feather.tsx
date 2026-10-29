import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FeatherMode, FeatherStage } from '../three/stage';
import plumaImg from '../assets/pluma.png';

interface FeatherApi {
  enabled: boolean;
  setMode: (m: FeatherMode) => void;
  setAnchor: (r: DOMRect | null) => void;
  celebrate: () => void;
  zoomThrough: (ms?: number) => void;
}

const Ctx = createContext<FeatherApi>({
  enabled: false,
  setMode: () => {},
  setAnchor: () => {},
  celebrate: () => {},
  zoomThrough: () => {},
});

export const useFeather = () => useContext(Ctx);

export function FeatherProvider({ animation, children }: { animation: 'completa' | 'suave' | 'off'; children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<FeatherStage | null>(null);
  const pending = useRef<{ mode: FeatherMode; anchor: DOMRect | null }>({ mode: 'hidden', anchor: null });
  const enabled = animation !== 'off';

  useEffect(() => {
    if (!enabled || !canvasRef.current) return;
    let cancelled = false;
    // Carga diferida: three.js no bloquea el primer pintado.
    import('../three/stage').then(({ FeatherStage }) => {
      if (cancelled || !canvasRef.current) return;
      try {
        const st = new FeatherStage(canvasRef.current);
        st.reduced = animation === 'suave' || matchMedia('(prefers-reduced-motion: reduce)').matches;
        st.setMode(pending.current.mode, pending.current.anchor);
        stageRef.current = st;
        if (import.meta.env.DEV) (window as unknown as { __stage: FeatherStage }).__stage = st;
      } catch {
        /* sin WebGL: la interfaz sigue funcionando sin la pluma 3D */
      }
    });
    return () => {
      cancelled = true;
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, [enabled, animation]);

  const api = useMemo<FeatherApi>(
    () => ({
      enabled,
      setMode: (m) => {
        pending.current.mode = m;
        stageRef.current?.setMode(m);
      },
      setAnchor: (r) => {
        pending.current.anchor = r;
        stageRef.current?.setAnchor(r);
      },
      celebrate: () => {
        stageRef.current?.celebrate();
        if (enabled) drawInk(inkRef.current);
      },
      zoomThrough: (ms) => stageRef.current?.zoomThrough(ms),
    }),
    [enabled],
  );

  return (
    <Ctx.Provider value={api}>
      {enabled && <canvas ref={canvasRef} className="feather-layer" aria-hidden="true" />}
      <canvas ref={inkRef} className="ink-layer" aria-hidden="true" />
      {children}
    </Ctx.Provider>
  );
}

// Reserva un hueco para la pluma en la pantalla actual (o muestra la imagen fija si no hay 3D).
export function FeatherSlot({ className, style, mode = 'home' }: { className?: string; style?: React.CSSProperties; mode?: FeatherMode }) {
  const ref = useRef<HTMLDivElement>(null);
  const f = useFeather();
  const update = useCallback(() => {
    if (ref.current) f.setAnchor(ref.current.getBoundingClientRect());
  }, [f]);
  useLayoutEffect(() => {
    if (!f.enabled) return;
    f.setMode(mode);
    update();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    if (ref.current) ro.observe(ref.current);
    // Las animaciones de entrada mueven el hueco sin cambiar su tamaño: volvemos a medir al acabar.
    const t1 = setTimeout(update, 450);
    const t2 = setTimeout(update, 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
      ro.disconnect();
      f.setMode('hidden');
      f.setAnchor(null);
    };
  }, [f, mode, update]);
  return (
    <div ref={ref} className={className} style={style} aria-hidden="true">
      {!f.enabled && <img src={plumaImg} alt="" style={{ height: '100%', transform: 'rotate(24deg)', display: 'block', margin: '0 auto' }} />}
    </div>
  );
}

// Onda suave alrededor de la pluma al celebrar.
function drawInk(canvas: HTMLCanvasElement | null) {
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = Math.min(devicePixelRatio, 2);
  const W = innerWidth;
  const H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const start = performance.now();
  const desktop = W >= 1024;
  const x = W - (desktop ? 120 : 70);
  const y = H - (desktop ? 60 : 120);
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 900);
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 20 + t * 140);
    g.addColorStop(0, `rgba(205,216,234,${0.35 * (1 - t)})`);
    g.addColorStop(1, 'rgba(205,216,234,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (t < 1) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(tick);
}

export function useStaticFeatherImage() {
  return plumaImg;
}

export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
