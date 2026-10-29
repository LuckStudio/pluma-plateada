import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, db, saveSettings, type Settings } from '../db/db';

// El tercer valor indica si ya se leyeron de la base de datos.
export function useSettings(): [Settings, (p: Partial<Settings>) => Promise<void>, boolean] {
  const s = useLiveQuery(() => db.settings.get('app').then((x) => x ?? null), []);
  return [{ ...DEFAULT_SETTINGS, ...(s ?? {}) }, saveSettings, s !== undefined];
}

// Avisos breves.
export const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function useToasts() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
  }, []);
  return { items, push };
}

export function useDebounced<T extends (...a: never[]) => void>(fn: T, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pend = useRef<Parameters<T> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (pend.current) ref.current(...pend.current);
    pend.current = null;
  }, []);
  const call = useCallback(
    (...args: Parameters<T>) => {
      pend.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, ms);
    },
    [ms, flush],
  );
  useEffect(() => flush, [flush]);
  return [call, flush] as const;
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function haceCuanto(ts: number, now = Date.now()) {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return 'ahora mismo';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}
