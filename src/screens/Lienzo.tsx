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
  type Animacion,
  type FontId,
  type FormatId,
  type LienzoOpts,
  type Ritmo,
  type StyleId,
  type VideoOpts,
} from '../export/lienzo';
import { Icon } from '../components/Icon';
import { Seg, Toggle, TopBar } from '../components/ui';
import { useFeather } from '../components/Feather';
import { elegirArchivo, guardarArchivo } from '../lib/download';
import { useMedia, useToast } from '../lib/hooks';

export const FIRMA_POR_DEFECTO = '@pluma_plateada';

export function LienzoPicker() {
  const poems = useLiveQuery(() => db.poems.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  return (
    <main className="screen">
      <TopBar title="Lienzo" />
      <p className="muted" style={{ marginTop: 4 }}>
        Convierte tus versos en imágenes, vídeos o láminas para imprimir. Elige un poema:
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

export function Lienzo({ id, salida }: { id: string; salida?: string }) {
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
  return <LienzoEditor poem={poem} inicial={salida === 'video' ? 'video' : 'imagen'} />;
}

interface Guardado {
  format: FormatId;
  style: StyleId;
  font: FontId;
  scale: number;
  showTitle: boolean;
  showFeather: boolean;
  signature: string;
  video: VideoOpts;
}

const CLAVE = 'pluma-lienzo-v2';
function leerPreferencias(): Partial<Guardado> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '{}');
  } catch {
    return {};
  }
}

type Salida = 'imagen' | 'video' | 'imprenta';

const ANIMACIONES: [Animacion, string][] = [
  ['ascenso', 'Ascenso'],
  ['fundido', 'Fundido'],
  ['palabras', 'Palabra a palabra'],
];

function LienzoEditor({ poem, inicial }: { poem: Poem; inicial: Salida }) {
  const toast = useToast();
  const feather = useFeather();
  const desktop = useMedia('(min-width: 1024px)');
  const prefs = useMemo(leerPreferencias, []);
  const lineas = useMemo(() => poem.text.replace(/\r/g, '').split('\n'), [poem.text]);
  const [sel, setSel] = useState<Set<number>>(() => new Set(lineas.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0)));
  const [format, setFormat] = useState<FormatId>(prefs.format ?? '3:4');
  const [style, setStyle] = useState<StyleId>(prefs.style && prefs.style !== 'imagen' ? prefs.style : 'plata');
  const [font, setFont] = useState<FontId>(prefs.font ?? 'cormorant');
  const [align, setAlign] = useState<'left' | 'center'>(poem.align);
  const [scale, setScale] = useState(prefs.scale ?? 1);
  const [showTitle, setShowTitle] = useState(prefs.showTitle ?? true);
  const [showFeather, setShowFeather] = useState(prefs.showFeather ?? true);
  const [signature, setSignature] = useState(prefs.signature ?? FIRMA_POR_DEFECTO);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [video, setVideo] = useState<VideoOpts>({ ...DEFAULT_VIDEO, ...prefs.video });
  const [salida, setSalida] = useState<Salida>(inicial);
  const [ocupado, setOcupado] = useState('');
  const [progreso, setProgreso] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [listo, setListo] = useState(false);
  const [compacta, setCompacta] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = useRef(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ format, style, font, scale, showTitle, showFeather, signature, video }));
    } catch {
      /* preferencia opcional */
    }
  }, [format, style, font, scale, showTitle, showFeather, signature, video]);

  // En el móvil la vista previa se encoge al bajar, pero siempre queda a la vista.
  useEffect(() => {
    if (desktop) return;
    const on = () => setCompacta(window.scrollY > 40);
    on();
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, [desktop]);

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
    const m = maquetar(ctx, opts, f.w, f.h, 0);
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
  }, [opts]);

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
    const m = maquetar(c.getContext('2d')!, opts, f.w, f.h, 0);
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
        <div className={`lienzo-preview ${compacta ? 'compacta' : ''}`}>
          <div className="canvas-stage">
            <canvas ref={canvas} aria-label={`Vista previa del lienzo en formato ${f.label}`} role="img" />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="meta">
              {f.label} · {f.mm ? `${f.mm.w}×${f.mm.h} mm` : `${f.w}×${f.h}`}
            </span>
            <button className="btn small" onClick={reproducir} disabled={!listo}>
              <Icon name={reproduciendo ? 'stop' : 'play'} size={14} /> {reproduciendo ? 'Parar' : `Ver animación · ${Math.round(duracion)} s`}
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
            <div className="chips" style={{ gap: 10 }}>
              {(Object.keys(ESTILOS) as StyleId[]).map((s) => (
                <button
                  key={s}
                  className="estilo"
                  aria-pressed={style === s}
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
                  <span
                    className="estilo-muestra"
                    // Solo una de las dos propiedades: un backgroundImage vacío borraría el degradado.
                    style={s === 'imagen' && bgImage ? { backgroundImage: `url(${bgImage.src})`, color: ESTILOS[s].text } : { background: MUESTRA[s], color: ESTILOS[s].text }}
                  >
                    {s === 'imagen' && !bgImage ? <Icon name="upload" size={18} /> : 'Aa'}
                  </span>
                  <span className="estilo-nombre">{ESTILOS[s].label}</span>
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
                  El fondo se ve desde el primer momento y cada verso aparece con un fundido. Se exporta en {f.label}.
                </p>
                <div className="stack" style={{ gap: 6 }}>
                  <span style={{ fontSize: 14 }}>Animación de los versos</span>
                  <div className="chips">
                    {ANIMACIONES.map(([a, l]) => (
                      <button key={a} className="chip" aria-pressed={video.animacion === a} onClick={() => setVideo({ ...video, animacion: a })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>Ritmo</span>
                  <Seg
                    label="Ritmo"
                    value={video.ritmo}
                    onChange={(ritmo: Ritmo) => setVideo({ ...video, ritmo })}
                    options={[
                      ['tranquilo', 'Tranquilo'],
                      ['normal', 'Normal'],
                      ['rapido', 'Rápido'],
                    ]}
                  />
                </div>
                <div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>Final</span>
                  <Seg
                    label="Final del vídeo"
                    value={video.salida}
                    onChange={(salida) => setVideo({ ...video, salida })}
                    options={[
                      ['fundido', 'Fundido'],
                      ['ninguna', 'Corte'],
                    ]}
                  />
                </div>
                <label className="field">
                  Pausa con el poema completo: {video.pausa.toFixed(1)} s
                  <input type="range" min={0.5} max={6} step={0.5} value={video.pausa} onChange={(e) => setVideo({ ...video, pausa: Number(e.target.value) })} />
                </label>
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
                    <Icon name="video" size={18} /> Exportar vídeo · {Math.round(duracion)} s
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
  noche: 'radial-gradient(120% 90% at 72% 18%, #2f4677 0%, #14203d 50%, #070b16 100%)',
  tinta: 'radial-gradient(70% 70% at 12% 88%, rgba(99,230,226,0.45), transparent 60%), radial-gradient(70% 70% at 90% 12%, rgba(212,140,242,0.5), transparent 60%), linear-gradient(135deg, #151236 0%, #26195a 55%, #0e3140 100%)',
  imagen: 'linear-gradient(135deg, #9aa3b5, #c3cad6)',
};
