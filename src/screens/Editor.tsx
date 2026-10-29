import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'wouter';
import { createPoem, db, deletePoem, poemTitle, snapshot, updateBook, updatePoem, type Poem } from '../db/db';
import { nombreArchivo } from '../db/backup';
import { analizarPoema } from '../poesia';
import { AnalysisPanel, type PanelTab } from '../components/AnalysisPanel';
import { PoemEditor, type Caret, type PoemEditorHandle } from '../components/PoemEditor';
import { Icon, type IconName } from '../components/Icon';
import { RimaTag, Seg, Sheet, useConfirmar } from '../components/ui';
import { useFeather } from '../components/Feather';
import { guardarArchivo } from '../lib/download';
import { haceCuanto, useDebounced, useMedia, useSettings, useToast } from '../lib/hooks';

export function EditorScreen({ id }: { id: string }) {
  const poem = useLiveQuery(() => db.poems.get(id).then((p) => p ?? null), [id]);
  if (poem === undefined) return <main className="screen" />;
  if (poem === null) {
    return (
      <main className="screen">
        <p className="empty">Este poema ya no existe.</p>
        <Link href="/" className="btn block">
          Volver al inicio
        </Link>
      </main>
    );
  }
  return <Editor poem={poem} />;
}

// Mantiene el dock por encima del teclado del móvil (visualViewport).
function useTeclado() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const raiz = document.documentElement;
    const actualizar = () => {
      // Diferencias pequeñas son barras del navegador, no el teclado.
      const diff = innerHeight - vv.height - vv.offsetTop;
      const kb = diff > 120 ? diff : 0;
      raiz.style.setProperty('--kb', `${Math.round(kb)}px`);
      raiz.classList.toggle('teclado', kb > 0);
    };
    raiz.classList.add('con-dock');
    actualizar();
    vv.addEventListener('resize', actualizar);
    vv.addEventListener('scroll', actualizar);
    return () => {
      vv.removeEventListener('resize', actualizar);
      vv.removeEventListener('scroll', actualizar);
      raiz.style.removeProperty('--kb');
      raiz.classList.remove('teclado', 'con-dock');
    };
  }, []);
}

type Grupo = 'escribir' | 'estudiar' | 'estilo' | 'crear';
interface Herramienta {
  icon?: IconName;
  glifo?: string;
  label: string;
  fn: () => void;
  on?: boolean;
}

function Editor({ poem }: { poem: Poem }) {
  const [, navigate] = useLocation();
  const toast = useToast();
  const feather = useFeather();
  const confirmar = useConfirmar();
  const [settings, setSettings] = useSettings();
  const desktop = useMedia('(min-width: 1024px)');
  const [text, setText] = useState(poem.text);
  const [title, setTitle] = useState(poem.title);
  const [saved, setSaved] = useState(true);
  const [caret, setCaret] = useState<Caret>({ linea: 0, palabra: '' });
  const [grupo, setGrupo] = useState<Grupo>('escribir');
  const [panel, setPanel] = useState<PanelTab | null>(null);
  const [deskTab, setDeskTab] = useState<PanelTab>('verso');
  const [zen, setZen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [libroSheet, setLibroSheet] = useState(false);
  const [temasSheet, setTemasSheet] = useState(false);
  const editor = useRef<PoemEditorHandle>(null);
  const actual = useRef({ text, title });
  actual.current = { text, title };
  const cambiado = useRef(false);
  useTeclado();

  const analisis = useMemo(() => analizarPoema(text), [text]);
  const metrica = settings.showMetrics;
  const lineaActual = analisis.lineas[caret.linea];

  const [guardar, flush] = useDebounced(async (t: string, ti: string) => {
    await updatePoem(poem.id, { text: t, title: ti });
    await snapshot({ ...poem, text: t, title: ti });
    setSaved(true);
  }, 450);

  const onText = (v: string) => {
    setText(v);
    setSaved(false);
    cambiado.current = true;
    guardar(v, title);
  };
  const onTitle = (v: string) => {
    setTitle(v);
    setSaved(false);
    cambiado.current = true;
    guardar(text, v);
  };

  // Al salir: guarda, deja una versión en el historial y borra los poemas que quedaron vacíos.
  useEffect(() => {
    return () => {
      flush();
      const { text: t, title: ti } = actual.current;
      if (!t.trim() && !ti.trim()) deletePoem(poem.id);
      else if (cambiado.current) snapshot({ ...poem, text: t, title: ti }, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!text) editor.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vocabulario = useMemo(() => [...new Set(text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/g) ?? [])], [text]);

  const usarPalabra = useCallback((w: string, modo: 'rima' | 'sinonimo') => {
    if (modo === 'sinonimo') editor.current?.reemplazarPalabra(w);
    else editor.current?.insertar(w);
  }, []);

  const estudiar = (t: PanelTab) => {
    if (desktop) setDeskTab(t);
    else setPanel(panel === t ? null : t);
  };

  const irLienzo = (salida?: 'video') => {
    flush();
    navigate(`/lienzo/${poem.id}${salida ? '/video' : ''}`);
  };

  const tamano = (d: number) => setSettings({ editorSize: Math.max(16, Math.min(30, settings.editorSize + d)) });

  const marcarEstado = async (status: Poem['status']) => {
    await updatePoem(poem.id, { status });
    if (status === 'terminado') {
      feather.celebrate();
      toast('Poema terminado. ¡Enhorabuena!');
    }
  };

  const exportarTxt = async () => {
    const t = poemTitle({ title, text });
    await guardarArchivo(new Blob([`${t}\n\n${text}\n`], { type: 'text/plain' }), nombreArchivo(t, 'txt'), { compartir: true });
  };

  const HERRAMIENTAS: Record<Grupo, Herramienta[]> = {
    escribir: [
      { icon: 'undo', label: 'Deshacer', fn: () => editor.current?.deshacer() },
      { icon: 'redo', label: 'Rehacer', fn: () => editor.current?.rehacer() },
      { icon: 'stanza', label: 'Estrofa', fn: () => editor.current?.nuevaEstrofa() },
      { icon: 'indent', label: 'Sangría', fn: () => editor.current?.sangria() },
      { glifo: '—', label: 'Raya', fn: () => editor.current?.insertar('—') },
      { glifo: '«»', label: 'Comillas', fn: () => editor.current?.insertarPar('«', '»') },
      { glifo: '…', label: 'Puntos', fn: () => editor.current?.insertar('…') },
      { glifo: '¿?', label: 'Pregunta', fn: () => editor.current?.insertarPar('¿', '?') },
      { glifo: '¡!', label: 'Exclamar', fn: () => editor.current?.insertarPar('¡', '!') },
    ],
    estudiar: [
      { icon: 'bars', label: 'Verso', fn: () => estudiar('verso'), on: panel === 'verso' },
      { icon: 'stanza', label: 'Poema', fn: () => estudiar('poema'), on: panel === 'poema' },
      { icon: 'rhyme', label: 'Rimas', fn: () => estudiar('rimas'), on: panel === 'rimas' },
      { icon: 'swap', label: 'Sinónimos', fn: () => estudiar('sinonimos'), on: panel === 'sinonimos' },
      { icon: 'doc', label: 'Datos', fn: () => estudiar('datos'), on: panel === 'datos' },
    ],
    estilo: [
      { icon: 'alignLeft', label: 'Izquierda', fn: () => updatePoem(poem.id, { align: 'left' }), on: poem.align === 'left' },
      { icon: 'align', label: 'Centrado', fn: () => updatePoem(poem.id, { align: 'center' }), on: poem.align === 'center' },
      { glifo: 'A−', label: 'Menor', fn: () => tamano(-1) },
      { glifo: 'A+', label: 'Mayor', fn: () => tamano(1) },
      { icon: 'bars', label: 'Métrica', fn: () => setSettings({ showMetrics: !metrica }), on: metrica },
      { icon: 'moon', label: 'Zen', fn: () => setZen(true) },
    ],
    crear: [
      { icon: 'image', label: 'Imagen', fn: () => irLienzo() },
      { icon: 'video', label: 'Vídeo', fn: () => irLienzo('video') },
      { icon: 'book', label: 'Libro', fn: () => setLibroSheet(true) },
      { icon: 'tag', label: 'Temas', fn: () => setTemasSheet(true) },
      { icon: 'history', label: 'Historial', fn: () => setHistorial(true) },
      { icon: 'download', label: 'Texto', fn: exportarTxt },
    ],
  };

  const GRUPOS: [Grupo, string, IconName][] = [
    ['escribir', 'Escribir', 'pen'],
    ['estudiar', 'Estudiar', 'bars'],
    ['estilo', 'Estilo', 'align'],
    ['crear', 'Crear', 'sparkle'],
  ];

  const boton = (h: Herramienta) => (
    <button key={h.label} className={`tool ${h.on ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={h.fn} aria-pressed={h.on}>
      {h.icon ? <Icon name={h.icon} size={18} /> : <span className="glifo">{h.glifo}</span>}
      {h.label}
    </button>
  );

  const panelProps = {
    analisis,
    linea: caret.linea,
    palabra: caret.palabra,
    onUsar: usarPalabra,
    vocabulario,
  };

  return (
    <main className={`screen wide editor-screen ${zen ? 'zen' : ''}`} style={{ paddingBottom: desktop ? 48 : 40 }}>
      {zen ? (
        createPortal(
          <button className="btn small zen-salir" onClick={() => setZen(false)}>
            <Icon name="close" size={15} /> Salir del modo zen
          </button>,
          document.body,
        )
      ) : (
        <header className="topbar" style={{ gap: 4 }}>
          <Link href="/" className="icon-btn" aria-label="Volver" style={{ marginLeft: -10 }}>
            <Icon name="back" size={22} />
          </Link>
          <div className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <input
              className="serif titulo-poema"
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              placeholder={poemTitle({ title: '', text }) === 'Sin título' ? 'Título' : poemTitle({ title: '', text })}
              aria-label="Título del poema"
            />
            <span className="meta row" style={{ gap: 4 }}>
              {saved ? (
                <>
                  <Icon name="check" size={12} stroke={2.4} /> Guardado
                </>
              ) : (
                'Guardando…'
              )}
              {poem.tags.length > 0 && <span className="faint"> · {poem.tags.join(', ')}</span>}
            </span>
          </div>
          <button className="icon-btn" aria-label="Opciones del poema" onClick={() => setMenu(true)}>
            <Icon name="more" size={20} />
          </button>
        </header>
      )}

      {!zen && metrica && analisis.stats.versos > 0 && (
        <div className="chips" style={{ margin: '8px 0 2px' }}>
          {analisis.medidaDominante && (
            <span className="chip info">{analisis.isosilabico ? `Todos de ${analisis.medidaDominante}` : `Sobre todo de ${analisis.medidaDominante}`}</span>
          )}
          <span className="chip info">
            {analisis.forma}
            {analisis.formaDetalle ? ` · ${analisis.formaDetalle}` : ''}
          </span>
          {analisis.tipoRima !== 'libre' && <span className="chip info">Rima {analisis.tipoRima}</span>}
        </div>
      )}

      <div className="editor-layout" style={{ marginTop: 10 }}>
        <div>
          {desktop && !zen && (
            <div className="toolbar editor-tools" role="toolbar" aria-label="Herramientas de escritura">
              {HERRAMIENTAS.escribir.map(boton)}
              <span className="tool-sep" />
              {HERRAMIENTAS.estilo.map(boton)}
              <span className="tool-sep" />
              {HERRAMIENTAS.crear.map(boton)}
            </div>
          )}
          <PoemEditor
            ref={editor}
            value={text}
            onChange={onText}
            analisis={analisis}
            metrica={metrica && !zen}
            align={poem.align}
            size={settings.editorSize}
            caretLine={caret.linea}
            onCaret={setCaret}
          />
        </div>
        {desktop && !zen && (
          <aside className="editor-side card pad" aria-label="Análisis del poema">
            <AnalysisPanel {...panelProps} tab={deskTab} onTab={setDeskTab} />
          </aside>
        )}
      </div>

      {!desktop &&
        !zen &&
        createPortal(
          <div className="dock">
            {panel && (
              <div className="dock-panel" role="region" aria-label="Análisis">
                <div className="row" style={{ justifyContent: 'flex-end', marginBottom: -4 }}>
                  <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Cerrar análisis" onClick={() => setPanel(null)}>
                    <Icon name="down" size={18} />
                  </button>
                </div>
                <AnalysisPanel {...panelProps} tab={panel} onTab={setPanel} compacto />
              </div>
            )}
            <button
              className="dock-strip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (setGrupo('estudiar'), setPanel(panel === 'verso' ? null : 'verso'))}
            >
              {lineaActual ? (
                <>
                  <b>{lineaActual.verso.medida}</b>
                  <span>{lineaActual.verso.tipo}</span>
                  <span className="faint">· {lineaActual.verso.final}</span>
                  {lineaActual.verso.subtipo && <span className="faint">· {lineaActual.verso.subtipo}</span>}
                  <span className="grow" />
                  <RimaTag letra={lineaActual.rima.letra} />
                </>
              ) : (
                <span className="faint">
                  {analisis.stats.versos ? `${analisis.stats.versos} versos · ${analisis.forma.toLowerCase()}` : 'Escribe un verso para ver su medida'}
                </span>
              )}
            </button>
            <div className="dock-tools" role="toolbar" aria-label={`Herramientas: ${grupo}`}>
              {HERRAMIENTAS[grupo].map(boton)}
            </div>
            <div className="dock-groups" role="tablist" aria-label="Grupos de herramientas">
              {GRUPOS.map(([g, l, icon]) => (
                <button
                  key={g}
                  role="tab"
                  aria-selected={grupo === g}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setGrupo(g);
                    if (g === 'estudiar' && !panel) setPanel('verso');
                    if (g !== 'estudiar') setPanel(null);
                  }}
                >
                  <Icon name={icon} size={15} /> {l}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}

      <Sheet open={menu} onClose={() => setMenu(false)} title="Poema">
        <div className="stack" style={{ gap: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Estado</span>
            <Seg
              label="Estado"
              value={poem.status}
              onChange={marcarEstado}
              options={[
                ['borrador', 'Borrador'],
                ['terminado', 'Terminado'],
              ]}
            />
          </div>
          <div>
            <MenuRow icon="tag" label="Temas" detalle={poem.tags.join(', ') || 'Ninguno'} onClick={() => (setMenu(false), setTemasSheet(true))} />
            <MenuRow icon="book" label="Añadir a un libro" onClick={() => (setMenu(false), setLibroSheet(true))} />
            <MenuRow icon="image" label="Llevar al lienzo" onClick={() => (setMenu(false), irLienzo())} />
            <MenuRow icon="history" label="Historial de versiones" onClick={() => (setMenu(false), setHistorial(true))} />
            <MenuRow
              icon="copy"
              label="Duplicar"
              onClick={async () => {
                flush();
                const nid = await createPoem(text, title ? `${title} (copia)` : '');
                setMenu(false);
                navigate(`/escribir/${nid}`);
              }}
            />
            <MenuRow icon="download" label="Exportar como texto (.txt)" onClick={exportarTxt} />
            <MenuRow
              icon="trash"
              label="Eliminar poema"
              danger
              onClick={async () => {
                setMenu(false);
                if (!(await confirmar('¿Eliminar este poema?', 'No se puede deshacer, salvo que tengas una copia de seguridad.'))) return;
                await deletePoem(poem.id);
                toast('Poema eliminado');
                navigate('/');
              }}
            />
          </div>
        </div>
      </Sheet>

      <TemasSheet open={temasSheet} onClose={() => setTemasSheet(false)} poem={poem} />
      <HistorialSheet
        open={historial}
        onClose={() => setHistorial(false)}
        poemId={poem.id}
        onRestaurar={(t, ti) => {
          onText(t);
          setTitle(ti);
          guardar(t, ti);
          setHistorial(false);
          toast('Versión restaurada');
        }}
      />
      <LibroSheet open={libroSheet} onClose={() => setLibroSheet(false)} poemId={poem.id} />
    </main>
  );
}

function MenuRow({ icon, label, onClick, danger, detalle }: { icon: IconName; label: string; onClick: () => void; danger?: boolean; detalle?: string }) {
  return (
    <button className="list-row" onClick={onClick} style={danger ? { color: '#c2334a' } : undefined}>
      <Icon name={icon} size={19} />
      <span className="grow">{label}</span>
      {detalle && (
        <span className="meta" style={{ maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detalle}
        </span>
      )}
    </button>
  );
}

function TemasSheet({ open, onClose, poem }: { open: boolean; onClose: () => void; poem: Poem }) {
  const todos = useLiveQuery(async () => [...new Set((await db.poems.toArray()).flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'es')), []) ?? [];
  const [nuevo, setNuevo] = useState('');
  const poner = (tags: string[]) => updatePoem(poem.id, { tags: [...new Set(tags)] });
  const anadir = () => {
    const t = nuevo.trim().toLowerCase();
    if (t) poner([...poem.tags, t]);
    setNuevo('');
  };
  const sugerencias = [...new Set([...todos, 'amor', 'memoria', 'naturaleza', 'nostalgia', 'esperanza', 'pérdida', 'ciudad', 'mar'])].filter(
    (t) => !poem.tags.includes(t),
  );
  return (
    <Sheet open={open} onClose={onClose} title="Temas">
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Los temas sirven para filtrar y agrupar tus poemas en Inicio.
      </p>
      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        {poem.tags.length === 0 && <span className="meta">Este poema aún no tiene temas.</span>}
        {poem.tags.map((t) => (
          <button key={t} className="chip" aria-pressed="true" onClick={() => poner(poem.tags.filter((x) => x !== t))} aria-label={`Quitar tema ${t}`}>
            {t} <Icon name="close" size={13} />
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          anadir();
        }}
      >
        <input className="input grow" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo tema" aria-label="Nuevo tema" />
        <button className="btn primary" type="submit" disabled={!nuevo.trim()}>
          Añadir
        </button>
      </form>
      <div className="eyebrow" style={{ margin: '16px 0 8px' }}>
        Sugerencias
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {sugerencias.slice(0, 16).map((t) => (
          <button key={t} className="chip" onClick={() => poner([...poem.tags, t])}>
            <Icon name="plus" size={13} /> {t}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function HistorialSheet({
  open,
  onClose,
  poemId,
  onRestaurar,
}: {
  open: boolean;
  onClose: () => void;
  poemId: string;
  onRestaurar: (t: string, ti: string) => void;
}) {
  const versiones = useLiveQuery(() => (open ? db.versions.where('poemId').equals(poemId).reverse().sortBy('at') : []), [open, poemId]) ?? [];
  const [ver, setVer] = useState<number | null>(null);
  return (
    <Sheet open={open} onClose={onClose} title="Historial">
      {versiones.length === 0 && <p className="empty">Todavía no hay versiones guardadas. Se crea una cada 10 minutos de escritura y al salir del poema.</p>}
      <div className="stack" style={{ gap: 8 }}>
        {versiones.map((v) => (
          <div key={v.id} className="card pad" style={{ boxShadow: 'none' }}>
            <button
              className="row"
              style={{ width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'left' }}
              onClick={() => setVer(ver === v.id ? null : v.id!)}
              aria-expanded={ver === v.id}
            >
              <span className="grow">
                <b>{new Date(v.at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>
                <span className="meta" style={{ display: 'block' }}>
                  {haceCuanto(v.at)} · {v.text.split('\n').filter((l) => l.trim()).length} versos
                </span>
              </span>
              <Icon name="eye" size={18} />
            </button>
            {ver === v.id && (
              <div className="stack" style={{ marginTop: 10 }}>
                <pre className="serif" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 17, lineHeight: 1.4 }}>
                  {v.text}
                </pre>
                <button className="btn small" onClick={() => onRestaurar(v.text, v.title)}>
                  Restaurar esta versión
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function LibroSheet({ open, onClose, poemId }: { open: boolean; onClose: () => void; poemId: string }) {
  const books = useLiveQuery(() => db.books.toArray(), []) ?? [];
  const [, navigate] = useLocation();
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Añadir a un libro">
      {books.length === 0 && (
        <div className="stack">
          <p className="empty">Aún no tienes ningún poemario.</p>
          <Link href="/libros" className="btn block" onClick={onClose}>
            Crear un libro
          </Link>
        </div>
      )}
      <div className="stack" style={{ gap: 12 }}>
        {books.map((b) => (
          <div key={b.id} className="card pad stack" style={{ gap: 6, boxShadow: 'none' }}>
            <b className="serif" style={{ fontSize: 20 }}>
              {b.title}
            </b>
            {b.parts.map((p) => {
              const dentro = p.poemIds.includes(poemId);
              return (
                <button
                  key={p.id}
                  className="list-row"
                  onClick={async () => {
                    const parts = b.parts.map((x) => ({ ...x, poemIds: x.poemIds.filter((i) => i !== poemId) }));
                    if (!dentro) parts.find((x) => x.id === p.id)!.poemIds.push(poemId);
                    await updateBook(b.id, { parts });
                    toast(dentro ? 'Quitado del libro' : `Añadido a «${p.title}»`);
                  }}
                >
                  <span className="grow">{p.title}</span>
                  {dentro ? <Icon name="check" size={18} /> : <span className="meta">Añadir</span>}
                </button>
              );
            })}
            <button className="btn small ghost" onClick={() => (onClose(), navigate(`/libros/${b.id}`))}>
              Abrir libro
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
