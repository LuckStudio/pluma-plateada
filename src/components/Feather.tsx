import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FeatherMode, FeatherStage } from '../three/stage';
import plumaImg from '../assets/pluma.png';

interface FeatherApi {
  enabled: boolean;
  setMode: (m: FeatherMode) => void;
  setAnchor: (r: DOMRect | null) => void;
  celebrate: () => void;
  transition: () => void;
}

const Ctx = createContext<FeatherApi>({
  enabled: false,
  setMode: () => {},
  setAnchor: () => {},
  celebrate: () => {},
  transition: () => {},
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
        if (enabled) drawInk(inkRef.current, 'drop');
      },
      transition: () => {
        stageRef.current?.transition();
        if (animation === 'completa') drawInk(inkRef.current, 'stroke');
      },
    }),
    [enabled, animation],
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
    return () => {
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

// Trazo de tinta holográfica que cruza la pantalla, o gota al celebrar.
function drawInk(canvas: HTMLCanvasElement | null, kind: 'stroke' | 'drop') {
  if (!canvas) return;
  const dpr = Math.min(devicePixelRatio, 2);
  const W = innerWidth;
  const H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const start = performance.now();
  const dur = kind === 'stroke' ? 650 : 900;
  const grad = ctx.createLinearGradient(0, H, W, 0);
  grad.addColorStop(0, 'rgba(99,230,226,0.9)');
  grad.addColorStop(0.5, 'rgba(143,134,255,0.9)');
  grad.addColorStop(1, 'rgba(212,140,242,0.9)');
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    ctx.clearRect(0, 0, W, H);
    if (kind === 'stroke') {
      const grow = Math.min(1, t / 0.6);
      const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = grad;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(3, Math.min(W, H) * 0.012);
      ctx.beginPath();
      const steps = 40;
      for (let i = 0; i <= steps * grow; i++) {
        const u = i / steps;
        const x = -20 + u * (W + 40);
        const y = H * 0.78 - u * H * 0.5 + Math.sin(u * Math.PI * 2.2) * H * 0.06;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      const desktop = W >= 1024;
      const x = W - (desktop ? 120 : 70);
      const y = H - (desktop ? 60 : 120);
      const r = 6 + t * Math.min(W, H) * 0.12;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.lineWidth = 3;
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
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
