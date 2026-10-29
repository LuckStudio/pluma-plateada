import { useEffect, useState } from 'react';
import { ultimaPalabra, type Analisis } from '../poesia';
import { buscarRimas, silabasDe, sinonimos } from '../lib/dict';
import { RimaTag, Seg } from './ui';

export type PanelTab = 'verso' | 'poema' | 'rimas' | 'sinonimos' | 'datos';

interface Props {
  analisis: Analisis;
  linea: number;
  palabra: string;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onUsar: (palabra: string, modo: 'rima' | 'sinonimo') => void;
  vocabulario: string[];
}

const TABS: [PanelTab, string][] = [
  ['verso', 'Verso'],
  ['poema', 'Poema'],
  ['rimas', 'Rimas'],
  ['sinonimos', 'Sinónimos'],
  ['datos', 'Datos'],
];

export function AnalysisPanel({ analisis, linea, palabra, tab, onTab, onUsar, vocabulario }: Props) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="tabs" role="tablist" aria-label="Análisis">
        {TABS.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => onTab(t)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'verso' && <TabVerso analisis={analisis} linea={linea} />}
      {tab === 'poema' && <TabPoema analisis={analisis} />}
      {tab === 'rimas' && <TabRimas analisis={analisis} linea={linea} palabra={palabra} onUsar={(w) => onUsar(w, 'rima')} vocabulario={vocabulario} />}
      {tab === 'sinonimos' && <TabSinonimos palabra={palabra} onUsar={(w) => onUsar(w, 'sinonimo')} />}
      {tab === 'datos' && <TabDatos analisis={analisis} />}
    </div>
  );
}

function TabVerso({ analisis, linea }: { analisis: Analisis; linea: number }) {
  const l = analisis.lineas[linea];
  if (!l) return <p className="empty">Coloca el cursor en un verso para ver cómo se mide.</p>;
  const v = l.verso;
  const ajuste = v.final === 'aguda' ? '+1 por acabar en aguda' : v.final === 'esdrújula' ? '−1 por acabar en esdrújula' : v.final === 'sobresdrújula' ? '−2 por acabar en sobresdrújula' : 'sin ajuste (llana)';
  return (
    <div className="stack" style={{ gap: 14 }}>
      <span className="eyebrow">Verso {analisis.lineas.slice(0, linea + 1).filter(Boolean).length}</span>
      <div className="syl-row">
        {v.silabasMetricas.map((s, i) => (
          <div key={i} className={`syl ${v.acentos.includes(i + 1) ? 't' : ''}`}>
            <span>{s.texto}</span>
            <span>{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="stat-grid">
        <div className="stat">
          <b>{v.medida}</b>
          <span>sílabas métricas · {v.tipo}</span>
        </div>
        <div className="stat">
          <b>{v.acentos.join('·') || '—'}</b>
          <span>acentos{v.subtipo ? ` · ${v.subtipo}` : ''}</span>
        </div>
      </div>
      <div className="card pad stack" style={{ gap: 6, fontSize: 14, boxShadow: 'none' }}>
        <span>
          Final <b>{v.final}</b>: {ajuste}
        </span>
        <span>
          {v.fonologicas} sílabas fonéticas · {v.sinalefas} {v.sinalefas === 1 ? 'sinalefa' : 'sinalefas'}
        </span>
        {v.silabasMetricas
          .filter((s) => s.texto.includes('‿'))
          .map((s, i) => (
            <span key={i} className="muted">
              Sinalefa: <b>{s.texto}</b> cuentan como una
            </span>
          ))}
        <span className="row">
          Rima <RimaTag letra={l.rima.letra} /> {l.rima.tipo !== 'libre' ? `${l.rima.tipo} en «${l.rima.terminacion?.consonante}»` : 'sin rima en el poema'}
        </span>
      </div>
      <p className="meta" style={{ margin: 0 }}>
        Las licencias (diéresis, sinéresis, hiato) dependen de cómo lo leas: el recuento sigue la lectura natural con sinalefa.
      </p>
    </div>
  );
}

function TabPoema({ analisis }: { analisis: Analisis }) {
  if (!analisis.stats.versos) return <p className="empty">Escribe algunos versos y aquí verás la forma del poema.</p>;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="serif" style={{ fontSize: 28, fontWeight: 600 }}>
          {analisis.forma}
        </div>
        {analisis.formaDetalle && <div className="muted">{analisis.formaDetalle}</div>}
      </div>
      <div className="serif" style={{ fontSize: 24, letterSpacing: '0.06em', wordBreak: 'break-word' }}>
        {analisis.esquema.replace(/-/g, '–')}
      </div>
      <div className="stat-grid">
        <div className="stat">
          <b>{analisis.medidaDominante ?? '—'}</b>
          <span>medida más usada{analisis.isosilabico ? ' · todos iguales' : ''}</span>
        </div>
        <div className="stat">
          <b style={{ fontSize: 20, paddingTop: 6 }}>{analisis.tipoRima}</b>
          <span>tipo de rima</span>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {analisis.estrofas.map((e, i) => (
          <div key={i} className="row" style={{ fontSize: 14 }}>
            <span className="faint" style={{ width: 64 }}>
              Estrofa {i + 1}
            </span>
            <span className="row" style={{ gap: 3 }}>
              {e.lineas.map((l, k) => (
                <RimaTag key={k} letra={l.rima.letra} />
              ))}
            </span>
            <span className="grow muted" style={{ textAlign: 'right' }}>
              {e.nombre ?? `${e.lineas.length} versos`}
            </span>
          </div>
        ))}
      </div>
      <p className="meta" style={{ margin: 0 }}>
        Mayúsculas: arte mayor (9 sílabas o más). Minúsculas: arte menor. «–»: verso sin rima.
      </p>
    </div>
  );
}

function TabRimas({ analisis, linea, palabra, onUsar, vocabulario }: { analisis: Analisis; linea: number; palabra: string; onUsar: (w: string) => void; vocabulario: string[] }) {
  const sugerida = palabra || ultimaPalabra(analisis.lineas[linea]?.verso.texto ?? '') || '';
  const [w, setW] = useState(sugerida);
  const [modo, setModo] = useState<'consonante' | 'asonante'>('consonante');
  const [res, setRes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => setW(sugerida), [sugerida]);
  useEffect(() => {
    if (!w.trim()) {
      setRes([]);
      return;
    }
    let vivo = true;
    setRes(null);
    setError('');
    buscarRimas(w.trim(), modo, vocabulario)
      .then((r) => vivo && setRes(r))
      .catch(() => vivo && setError('No se pudo cargar el diccionario. Inténtalo de nuevo con conexión.'));
    return () => {
      vivo = false;
    };
  }, [w, modo, vocabulario]);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="field">
        Riman con
        <input className="input serif" style={{ fontSize: 20 }} value={w} onChange={(e) => setW(e.target.value)} />
      </label>
      <Seg
        label="Tipo de rima"
        value={modo}
        onChange={setModo}
        options={[
          ['consonante', 'Consonante'],
          ['asonante', 'Asonante'],
        ]}
      />
      {error && <p className="empty">{error}</p>}
      {res === null && !error && <p className="meta">Buscando rimas…</p>}
      {res && res.length === 0 && w.trim() && <p className="empty">No he encontrado rimas {modo}s para «{w}».</p>}
      <div className="row wrap" style={{ gap: 8 }}>
        {res?.map((r) => (
          <button key={r} className="word-chip" onClick={() => onUsar(r)}>
            {r} <small>{silabasDe(r)}</small>
          </button>
        ))}
      </div>
      {!!res?.length && <p className="meta" style={{ margin: 0 }}>Toca una palabra para añadirla al verso. El número son sus sílabas.</p>}
    </div>
  );
}

function TabSinonimos({ palabra, onUsar }: { palabra: string; onUsar: (w: string) => void }) {
  const [w, setW] = useState(palabra);
  const [grupos, setGrupos] = useState<string[][] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => setW(palabra), [palabra]);
  useEffect(() => {
    if (!w.trim()) {
      setGrupos([]);
      return;
    }
    let vivo = true;
    setGrupos(null);
    setError('');
    sinonimos(w.trim())
      .then((g) => vivo && setGrupos(g))
      .catch(() => vivo && setError('No se pudo cargar el diccionario. Inténtalo de nuevo con conexión.'));
    return () => {
      vivo = false;
    };
  }, [w]);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="field">
        Sinónimos de
        <input className="input serif" style={{ fontSize: 20 }} value={w} onChange={(e) => setW(e.target.value)} placeholder="Toca una palabra del poema" />
      </label>
      {error && <p className="empty">{error}</p>}
      {grupos === null && !error && <p className="meta">Buscando…</p>}
      {grupos && grupos.length === 0 && w.trim() && <p className="empty">No tengo sinónimos para «{w}». Prueba con la forma base (singular, masculino o infinitivo).</p>}
      {grupos?.map((g, i) => (
        <div key={i} className="row wrap" style={{ gap: 8 }}>
          {g.map((s) => (
            <button key={s} className="word-chip" onClick={() => onUsar(s)}>
              {s} <small>{silabasDe(s.split(' ').pop() ?? s) + (s.includes(' ') ? '+' : '')}</small>
            </button>
          ))}
        </div>
      ))}
      {!!grupos?.length && <p className="meta" style={{ margin: 0 }}>Toca uno para sustituir la palabra. El número indica sus sílabas, para que sepas si cuadra en el verso.</p>}
    </div>
  );
}

function TabDatos({ analisis }: { analisis: Analisis }) {
  const s = analisis.stats;
  const lectura = s.lecturaSeg < 60 ? `${s.lecturaSeg} s` : `${Math.round(s.lecturaSeg / 60)} min`;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="stat-grid">
        <div className="stat">
          <b>{s.versos}</b>
          <span>versos</span>
        </div>
        <div className="stat">
          <b>{s.estrofas}</b>
          <span>estrofas</span>
        </div>
        <div className="stat">
          <b>{s.palabras}</b>
          <span>palabras</span>
        </div>
        <div className="stat">
          <b>{lectura}</b>
          <span>lectura en voz alta</span>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Palabras repetidas</span>
        {s.repetidas.length === 0 && <span className="muted" style={{ fontSize: 14 }}>Ninguna palabra con significado se repite.</span>}
        <div className="row wrap" style={{ gap: 8 }}>
          {s.repetidas.slice(0, 20).map((r) => (
            <span key={r.palabra} className="word-chip" style={{ cursor: 'default' }}>
              {r.palabra} <small>×{r.veces}</small>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
