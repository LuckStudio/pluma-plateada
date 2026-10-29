import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { db, poemTitle, type Poem } from '../db/db';
import { nombreArchivo } from '../db/backup';
import {
  DEFAULT_VIDEO,
  ESTILOS,
  FORMATOS,
  FUENTES,
  cargarFuentes,
  cargarPluma,
  dibujar,
  duracionVideo,
  formato,
  maquetar,
  type FontId,
  type FormatId,
  type LienzoOpts,
  type StyleId,
  type Transicion,
  type VideoOpts,
} from '../export/lienzo';
import { Icon } from '../components/Icon';
import { Seg, Toggle, TopBar } from '../components/ui';
import { useFeather } from '../components/Feather';
import { elegirArchivo, guardarArchivo } from '../lib/download';
import { useSettings, useToast } from '../lib/hooks';
import { PoemCard } from './Home';

export function LienzoPicker() {
  const poems = useLiveQuery(() => db.poems.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  return (
    <main className="screen">
      <TopBar title="Lienzo" />
      <p className="muted" style={{ marginTop: 4 }}>
        Convierte tus versos en imágenes, vídeos que se escriben solos o láminas para imprimir. Elige un poema:
      </p>
      <div className="stack" style={{ marginTop: 16 }}>
        {poems.length === 0 && <p className="empty">Escribe un poema primero.</p>}
        {poems.map((p) => (
          <Link key={p.id} href={`/lienzo/${p.id}`} className="card poem-card">
            <span className="title">{poemTitle(p)}</span>
            <span className="preview">
              {p.text
                .split('\n')
                .filter((l) => l.trim())
                .slice(0, 2)
                .join('\n')}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}

export function Lienzo({ id }: { id: string }) {
  const poem = useLiveQuery(() => db.poems.get(id).then((p) => p ?? null), [id]);
  if (poem === undefined) return <main className="screen" />;
  if (poem === null)
    return (
      <main className="screen">
        <p className="empty">Este poema ya no existe.</p>
        <Link href="/lienzo" className="btn block">
          Elegir otro poema
        </Link>
      </main>
    );
  return <LienzoEditor poem={poem} />;
}

interface Guardado {
  format: FormatId;
  style: StyleId;
  font: FontId;
  scale: number;
  showTitle: boolean;
  showFeather: boolean;
  video: VideoOpts;
}

const CLAVE = 'pluma-lienzo';
function leerPreferencias(): Partial<Guardado> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '{}');
  } catch {
    return {};
  }
}

type Salida = 'imagen' | 'video' | 'imprenta';

const TRANSICIONES: [Transicion, string][] = [
  ['tinta', 'Tinta'],
  ['fundido', 'Fundido'],
  ['deslizar', 'Deslizar'],
  ['ninguna', 'Ninguna'],
];

function LienzoEditor({ poem }: { poem: Poem }) {
  const toast = useToast();
  const feather = useFeather();
  const [settings] = useSettings();
  const prefs = useMemo(leerPreferencias, []);
  const lineas = useMemo(() => poem.text.replace(/\r/g, '').split('\n'), [poem.text]);
  const [sel, setSel] = useState<Set<number>>(() => new Set(lineas.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0)));
  const [format, setFormat] = useState<FormatId>(prefs.format ?? '3:4');
  const [style, setStyle] = useState<StyleId>(prefs.style && prefs.style !== 'imagen' ? prefs.style : settings.theme);
  const [font, setFont] = useState<FontId>(prefs.font ?? 'cormorant');
  const [align, setAlign] = useState<'left' | 'center'>(poem.align);
  const [scale, setScale] = useState(prefs.scale ?? 1);
  const [showTitle, setShowTitle] = useState(prefs.showTitle ?? true);
  const [showFeather, setShowFeather] = useState(prefs.showFeather ?? true);
  const [signature, setSignature] = useState(settings.author);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [video, setVideo] = useState<VideoOpts>({ ...DEFAULT_VIDEO, ...prefs.video });
  const [salida, setSalida] = useState<Salida>('imagen');
  const [ocupado, setOcupado] = useState('');
  const [progreso, setProgreso] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [listo, setListo] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = useRef(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => setSignature((s) => s || settings.author), [settings.author]);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ format, style, font, scale, showTitle, showFeather, video }));
    } catch {
      /* preferencia opcional */
    }
  }, [format, style, font, scale, showTitle, showFeather, video]);

  const opts: LienzoOpts = useMemo(() => {
    const elegidas = lineas.filter((l, i) => {
      if (l.trim()) return sel.has(i);
      // Una línea en blanco se conserva si separa versos elegidos (salto de estrofa).
      const antes = lineas.slice(0, i).some((x, k) => x.trim() && sel.has(k));
      const despues = lineas.slice(i + 1).some((x, k) => x.trim() && sel.has(i + 1 + k));
      return antes && despues;
    });
    return { format, style, font, align, scale, lines: elegidas, title: poemTitle(poem), showTitle, signature: signature.trim(), showFeather, bgImage };
  }, [lineas, sel, format, style, font, align, scale, poem, showTitle, signature, showFeather, bgImage]);

  // Vista previa a media resolución.
  const PREVIEW = 0.5;
  const preparar = () => {
    const c = canvas.current;
    if (!c) return null;
    const f = formato(opts.format);
    c.width = Math.round(f.w * PREVIEW);
    c.height = Math.round(f.h * PREVIEW);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(PREVIEW, 0, 0, PREVIEW, 0, 0);
    const m = maquetar(ctx, opts, f.w, f.h, 0, video.velocidad);
    return { ctx, m };
  };

  useEffect(() => {
    let vivo = true;
    Promise.all([cargarPluma(), cargarFuentes(opts.font)]).then(() => {
      if (!vivo) return;
      setListo(true);
      cancelAnimationFrame(anim.current);
      setReproduciendo(false);
      const p = preparar();
      if (p) dibujar(p.ctx, opts, p.m);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, video.velocidad]);

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const reproducir = () => {
    const p = preparar();
    if (!p) return;
    if (reproduciendo) {
      cancelAnimationFrame(anim.current);
      setReproduciendo(false);
      dibujar(p.ctx, opts, p.m);
      return;
    }
    const total = duracionVideo(p.m, video);
    const t0 = performance.now();
    setReproduciendo(true);
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      dibujar(p.ctx, opts, p.m, { t: Math.min(t, total), v: video });
      if (t < total) anim.current = requestAnimationFrame(tick);
      else {
        setReproduciendo(false);
        dibujar(p.ctx, opts, p.m);
      }
    };
    anim.current = requestAnimationFrame(tick);
  };

  const duracion = useMemo(() => {
    if (!listo) return 0;
    const c = document.createElement('canvas');
    const f = formato(opts.format);
    const m = maquetar(c.getContext('2d')!, opts, f.w, f.h, 0, video.velocidad);
    return duracionVideo(m, video);
  }, [opts, video, listo]);

  const nombre = (ext: string) => nombreArchivo(`${poemTitle(poem)}-${opts.format.replace(':', 'x')}`, ext);

  const exportar = async (que: 'png' | 'jpg' | 'pdf' | 'video') => {
    if (!opts.lines.some((l) => l.trim())) {
      toast('Elige al menos un verso');
      return;
    }
    setOcupado(que);
    setProgreso(0);
    try {
      if (que === 'video') {
        abort.current = new AbortController();
        const { exportarVideo } = await import('../export/video');
        const r = await exportarVideo(opts, video, setProgreso, abort.current.signal);
        await guardarArchivo(r.blob, nombre(r.ext), { compartir: true });
        if (r.ext === 'webm') toast('Vídeo en WebM: este navegador no codifica MP4');
      } else if (que === 'pdf') {
        const { exportarPdfImprenta } = await import('../export/imagen');
        await guardarArchivo(await exportarPdfImprenta(opts), nombre('pdf'), { compartir: true });
      } else {
        const { exportarImagen } = await import('../export/imagen');
        await guardarArchivo(await exportarImagen(opts, que), nombre(que), { compartir: true });
      }
      feather.celebrate();
      toast('¡Listo!');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      setOcupado('');
      abort.current = null;
    }
  };

  const f = formato(format);
  const todos = lineas.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);

  return (
    <main className="screen wide">
      <TopBar back={`/escribir/${poem.id}`} title={<h1 className="grow">Lienzo</h1>} />
      <div className="lienzo-layout" style={{ marginTop: 8 }}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="canvas-stage">
            <canvas ref={canvas} aria-label={`Vista previa del lienzo en formato ${f.label}`} role="img" />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="meta">
              {f.label} · {f.mm ? `${f.mm.w}×${f.mm.h} mm a 300 ppp` : `${f.w}×${f.h} px`}
            </span>
            <button className="btn small" onClick={reproducir} disabled={!listo}>
              <Icon name={reproduciendo ? 'stop' : 'play'} size={14} /> {reproduciendo ? 'Parar' : `Ver vídeo (${Math.round(duracion)} s)`}
            </button>
          </div>
        </div>

        <div className="stack" style={{ gap: 22 }}>
          <section className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Formato</span>
            <div className="chips">
              {FORMATOS.map((x) => (
                <button key={x.id} className="fmt-btn" aria-pressed={format === x.id} onClick={() => setFormat(x.id)}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{x.label}</span>
                  <small>{x.sub}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Estilo</span>
            <div className="chips">
              {(Object.keys(ESTILOS) as StyleId[]).map((s) => (
                <button
                  key={s}
                  className="style-btn"
                  aria-pressed={style === s}
                  aria-label={`Estilo ${ESTILOS[s].label}`}
                  style={{ background: MUESTRA[s], backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: s === 'imagen' && bgImage ? `url(${bgImage.src})` : undefined }}
                  onClick={async () => {
                    if (s !== 'imagen') return setStyle(s);
                    const file = await elegirArchivo('image/*');
                    if (!file) return;
                    const img = new Image();
                    img.onload = () => {
                      setBgImage(img);
                      setStyle('imagen');
                    };
                    img.src = URL.createObjectURL(file);
                  }}
                >
                  <span>{ESTILOS[s].label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="stack" style={{ gap: 10 }}>
            <span className="eyebrow">Letra</span>
            <div className="chips">
              {(Object.keys(FUENTES) as FontId[]).map((k) => (
                <button key={k} className="chip" aria-pressed={font === k} onClick={() => setFont(k)} style={{ fontFamily: `"${FUENTES[k].family}"`, fontStyle: FUENTES[k].style, fontSize: 15 }}>
                  {FUENTES[k].label}
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14 }}>Alineación</span>
              <Seg
                label="Alineación"
                value={align}
                onChange={setAlign}
                options={[
                  ['left', 'Izquierda'],
                  ['center', 'Centrada'],
                ]}
              />
            </div>
            <label className="field">
              Tamaño del texto
              <input type="range" min={0.6} max={1.5} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
            </label>
            <div>
              <Toggle label="Mostrar el título" checked={showTitle} onChange={setShowTitle} />
              <Toggle label="Pluma decorativa" checked={showFeather} onChange={setShowFeather} />
            </div>
            <label className="field">
              Firma
              <input className="input" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Tu nombre o @usuario (opcional)" />
            </label>
          </section>

          <section className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="eyebrow">Versos</span>
              <div className="row">
                <button className="btn small ghost" onClick={() => setSel(new Set(todos))}>
                  Todos
                </button>
                <button className="btn small ghost" onClick={() => setSel(new Set())}>
                  Ninguno
                </button>
              </div>
            </div>
            <div className="card" style={{ padding: '4px 14px', boxShadow: 'none' }}>
              {lineas.map((l, i) =>
                l.trim() ? (
                  <label key={i} className="list-row" style={{ cursor: 'pointer', minHeight: 44 }}>
                    <input
                      type="checkbox"
                      checked={sel.has(i)}
                      onChange={(e) => {
                        const n = new Set(sel);
                        if (e.target.checked) n.add(i);
                        else n.delete(i);
                        setSel(n);
                      }}
                      style={{ width: 20, height: 20, accentColor: '#6f66f2', flex: '0 0 auto' }}
                    />
                    <span className="serif" style={{ fontSize: 17 }}>
                      {l}
                    </span>
                  </label>
                ) : (
                  <div key={i} style={{ height: 8 }} />
                ),
              )}
            </div>
          </section>

          <section className="card pad stack" style={{ gap: 14 }}>
            <div className="tabs" role="tablist" aria-label="Tipo de exportación">
              {(
                [
                  ['imagen', 'Imagen'],
                  ['video', 'Vídeo'],
                  ['imprenta', 'Imprenta'],
                ] as [Salida, string][]
              ).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={salida === k} onClick={() => setSalida(k)}>
                  {l}
                </button>
              ))}
            </div>

            {salida === 'imagen' && (
              <div className="row">
                <button className="btn primary grow" disabled={!!ocupado} onClick={() => exportar('png')}>
                  <Icon name="image" size={18} /> {ocupado === 'png' ? 'Creando…' : 'PNG'}
                </button>
                <button className="btn grow" disabled={!!ocupado} onClick={() => exportar('jpg')}>
                  {ocupado === 'jpg' ? 'Creando…' : 'JPG'}
                </button>
              </div>
            )}

            {salida === 'video' && (
              <div className="stack" style={{ gap: 12 }}>
                <p className="meta" style={{ margin: 0 }}>
                  Los versos se escriben letra a letra, con la pluma trazándolos, en el formato {f.label}.
                </p>
                <div className="stack" style={{ gap: 6 }}>
                  <span style={{ fontSize: 14 }}>Entrada</span>
                  <div className="chips">
                    {TRANSICIONES.map(([t, l]) => (
                      <button key={t} className="chip" aria-pressed={video.entrada === t} onClick={() => setVideo({ ...video, entrada: t })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <span style={{ fontSize: 14 }}>Salida</span>
                  <div className="chips">
                    {TRANSICIONES.map(([t, l]) => (
                      <button key={t} className="chip" aria-pressed={video.salida === t} onClick={() => setVideo({ ...video, salida: t })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14 }}>Velocidad</span>
                  <Seg
                    label="Velocidad de escritura"
                    value={video.velocidad}
                    onChange={(velocidad) => setVideo({ ...video, velocidad })}
                    options={[
                      ['lenta', 'Lenta'],
                      ['normal', 'Normal'],
                      ['rapida', 'Rápida'],
                    ]}
                  />
                </div>
                <label className="field">
                  Pausa final: {video.pausa.toFixed(1)} s
                  <input type="range" min={0.5} max={6} step={0.5} value={video.pausa} onChange={(e) => setVideo({ ...video, pausa: Number(e.target.value) })} />
                </label>
                <Toggle label="Pluma escribiendo" checked={video.pluma} onChange={(pluma) => setVideo({ ...video, pluma })} />
                {ocupado === 'video' ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="progress" style={{ height: 6 }}>
                      <div style={{ width: `${Math.round(progreso * 100)}%` }} />
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="meta">Creando vídeo… {Math.round(progreso * 100)}%</span>
                      <button className="btn small" onClick={() => abort.current?.abort()}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn primary block" disabled={!!ocupado} onClick={() => exportar('video')}>
                    <Icon name="video" size={18} /> Exportar vídeo ({Math.round(duracion)} s)
                  </button>
                )}
              </div>
            )}

            {salida === 'imprenta' && (
              <div className="stack" style={{ gap: 10 }}>
                <p className="meta" style={{ margin: 0 }}>
                  PDF a 300 ppp con 3 mm de sangrado y marcas de corte. Ideal para postales, marcapáginas y láminas.
                </p>
                <button className="btn primary block" disabled={!!ocupado} onClick={() => exportar('pdf')}>
                  <Icon name="doc" size={18} /> {ocupado === 'pdf' ? 'Creando…' : 'PDF para imprenta'}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

const MUESTRA: Record<StyleId, string> = {
  plata: 'linear-gradient(160deg, #f6f8fb 0%, #d3d9e3 60%, #a9b2c2 100%)',
  papel: '#f2eee5',
  noche: 'radial-gradient(120% 80% at 70% 20%, #1d2a47 0%, #0b1120 60%, #05070d 100%)',
  tinta: 'linear-gradient(135deg, #0b1020 0%, #1b1640 55%, #0c2a33 100%)',
  imagen: 'repeating-linear-gradient(45deg, #9aa3b5 0 8px, #c3cad6 8px 16px)',
};
