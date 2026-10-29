import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Icon, type IconName } from './Icon';
import plumin from '../assets/plumin.png';

export function Sheet({ open, onClose, title, children, label }: { open: boolean; onClose: () => void; title?: string; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label ?? title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {title && (
          <div className="row" style={{ marginBottom: 6 }}>
            <h2 className="grow" style={{ margin: 0 }}>
              {title}
            </h2>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <Icon name="close" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const NAV: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Inicio', icon: 'home', match: (p) => p === '/' },
  { href: '/libros', label: 'Libros', icon: 'book', match: (p) => p.startsWith('/libros') },
  { href: '/lienzo', label: 'Lienzo', icon: 'canvas', match: (p) => p.startsWith('/lienzo') },
  { href: '/ajustes', label: 'Ajustes', icon: 'settings', match: (p) => p.startsWith('/ajustes') },
];

export function Navigation({ onWrite, sinBarraInferior }: { onWrite: () => void; sinBarraInferior?: boolean }) {
  const [loc] = useLocation();
  const item = (n: (typeof NAV)[number]) => (
    <Link key={n.href} href={n.href} className="nav-item" aria-current={n.match(loc) ? 'page' : undefined}>
      <Icon name={n.icon} size={22} stroke={1.6} />
      {n.label}
    </Link>
  );
  return (
    <>
      {!sinBarraInferior && (
        <nav className="bottom-nav" aria-label="Principal">
          {item(NAV[0])}
          {item(NAV[1])}
          <button className="nav-fab" onClick={onWrite} aria-label="Escribir poema nuevo">
            <Icon name="pen" size={24} stroke={1.8} />
          </button>
          {item(NAV[2])}
          {item(NAV[3])}
        </nav>
      )}
      <nav className="side-nav" aria-label="Principal">
        <div className="brand">
          <img src={plumin} alt="" style={{ height: 30, transform: 'rotate(-24deg)' }} />
          Pluma Plateada
        </div>
        <button className="btn primary" onClick={onWrite} style={{ marginBottom: 14 }}>
          <Icon name="pen" size={18} /> Escribir poema
        </button>
        {NAV.map(item)}
      </nav>
    </>
  );
}

export function TopBar({ title, back, children }: { title?: ReactNode; back?: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      {back && (
        <Link href={back} className="icon-btn" aria-label="Volver" style={{ marginLeft: -10 }}>
          <Icon name="back" size={22} />
        </Link>
      )}
      {typeof title === 'string' ? <h1>{title}</h1> : title}
      {children}
    </header>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="list-row" style={{ cursor: 'pointer' }}>
      <span className="grow">
        {label}
        {hint && (
          <span className="meta" style={{ display: 'block', marginTop: 2 }}>
            {hint}
          </span>
        )}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function RimaTag({ letra }: { letra: string }) {
  if (letra === '-') return <span className="rima libre" title="Sin rima">–</span>;
  const idx = (letra.toUpperCase().charCodeAt(0) - 65) % 6;
  return (
    <span className="rima" style={{ background: `var(--rima-${'abcdef'[idx]})` }} title={`Rima ${letra}`}>
      {letra}
    </span>
  );
}
