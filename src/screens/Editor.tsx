import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { createPoem, db, deletePoem, poemTitle, snapshot, updateBook, updatePoem, type Poem } from '../db/db';
import { nombreArchivo } from '../db/backup';
import { analizarPoema } from '../poesia';
import { AnalysisPanel, type PanelTab } from '../components/AnalysisPanel';
import { PoemEditor, type Caret, type PoemEditorHandle } from '../components/PoemEditor';
import { Icon, type IconName } from '../components/Icon';
import { Seg, Sheet } from '../components/ui';
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

function Editor({ poem }: { poem: Poem }) {
  const [, navigate] = useLocation();
  const toast = useToast();
  const feather = useFeather();
  const [settings, setSettings] = useSettings();
  const desktop = useMedia('(min-width: 1024px)');
  const [text, setText] = useState(poem.text);
  const [title, setTitle] = useState(poem.title);
  const [saved, setSaved] = useState(true);
  const [caret, setCaret] = useState<Caret>({ linea: 0, palabra: '' });
  const [panel, setPanel] = useState<PanelTab | null>(null);
  const [deskTab, setDeskTab] = useState<PanelTab>('verso');
  const [menu, setMenu] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [libroSheet, setLibroSheet] = useState(false);
  const editor = useRef<PoemEditorHandle>(null);
  const actual = useRef({ text, title });
  actual.current = { text, title };
  const cambiado = useRef(false);

  const analisis = useMemo(() => analizarPoema(text), [text]);
  const metrica = settings.showMetrics;

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

  const usarPalabra = useCallback(
    (w: string, modo: 'rima' | 'sinonimo') => {
      if (modo === 'sinonimo') editor.current?.reemplazarPalabra(w);
      else editor.current?.insertar(w);
      if (!desktop) setPanel(null);
    },
    [desktop],
  );

  const abrir = (t: PanelTab) => {
    if (desktop) setDeskTab(t);
    else setPanel(t);
  };

  const herramientas: [IconName, string, () => void, boolean?][] = [
    ['bars', 'Análisis', () => abrir('verso')],
    ['rhyme', 'Rimas', () => abrir('rimas')],
    ['swap', 'Sinónimos', () => abrir('sinonimos')],
    ['stanza', 'Estrofa', () => editor.current?.nuevaEstrofa()],
    ['indent', 'Sangría', () => editor.current?.sangria()],
    ['undo', 'Deshacer', () => editor.current?.deshacer()],
    ['redo', 'Rehacer', () => editor.current?.rehacer()],
    ['canvas', 'Lienzo', () => irLienzo()],
  ];

  const irLienzo = async () => {
    flush();
    navigate(`/lienzo/${poem.id}`);
  };

  const marcarEstado = async (status: Poem['status']) => {
    await updatePoem(poem.id, { status });
    if (status === 'terminado') {
      feather.celebrate();
      toast('Poema terminado. ¡Enhorabuena!');
    }
  };

  const panelProps = {
    analisis,
    linea: caret.linea,
    palabra: caret.palabra,
    onUsar: usarPalabra,
    vocabulario,
  };

  return (
    <main className="screen wide" style={{ paddingBottom: desktop ? 48 : 110 }}>
      <header className="topbar" style={{ gap: 4 }}>
        <Link href="/" className="icon-btn" aria-label="Volver" style={{ marginLeft: -10 }}>
          <Icon name="back" size={22} />
        </Link>
        <div className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
          <input
            className="serif"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder={poemTitle({ title: '', text }) === 'Sin título' ? 'Título' : poemTitle({ title: '', text })}
            aria-label="Título del poema"
            style={{ border: 0, background: 'transparent', fontSize: 21, fontWeight: 600, padding: 0, textOverflow: 'ellipsis', outline: 'none', width: '100%' }}
          />
          <span className="meta row" style={{ gap: 4 }}>
            {saved ? (
              <>
                <Icon name="check" size={12} stroke={2.4} /> Guardado en este dispositivo
              </>
            ) : (
              'Guardando…'
            )}
          </span>
        </div>
        <button className="chip" aria-pressed={metrica} onClick={() => setSettings({ showMetrics: !metrica })} title="Mostrar u ocultar la métrica">
          <Icon name="bars" size={14} /> Métrica
        </button>
        <button className="icon-btn" aria-label="Más opciones" onClick={() => setMenu(true)}>
          <Icon name="more" size={20} />
        </button>
      </header>

      {metrica && analisis.stats.versos > 0 && (
        <div className="chips" style={{ margin: '10px 0 4px' }}>
          {analisis.medidaDominante && (
            <span className="chip" style={{ cursor: 'default' }}>
              {analisis.isosilabico ? `Todos de ${analisis.medidaDominante}` : `Sobre todo de ${analisis.medidaDominante}`}
            </span>
          )}
          <span className="chip" style={{ cursor: 'default' }}>
            {analisis.forma}
            {analisis.formaDetalle ? ` · ${analisis.formaDetalle}` : ''}
          </span>
          {analisis.tipoRima !== 'libre' && (
            <span className="chip" style={{ cursor: 'default' }}>
              Rima {analisis.tipoRima}
            </span>
          )}
        </div>
      )}

      <div className="editor-layout" style={{ marginTop: 10 }}>
        <div>
          {desktop && (
            <div className="toolbar editor-tools" role="toolbar" aria-label="Herramientas de escritura">
              {herramientas.map(([icon, label, fn]) => (
                <button key={label} className="tool" onClick={fn}>
                  <Icon name={icon} size={18} />
                  {label}
                </button>
              ))}
            </div>
          )}
          <PoemEditor
            ref={editor}
            value={text}
            onChange={onText}
            analisis={analisis}
            metrica={metrica}
            align={poem.align}
            size={settings.editorSize}
            caretLine={caret.linea}
            onCaret={setCaret}
          />
        </div>
        {desktop && (
          <aside className="editor-side card pad" aria-label="Análisis del poema">
            <AnalysisPanel {...panelProps} tab={deskTab} onTab={setDeskTab} />
          </aside>
        )}
      </div>

      {!desktop && (
        <div className="toolbar" role="toolbar" aria-label="Herramientas de escritura">
          {herramientas.map(([icon, label, fn]) => (
            <button key={label} className="tool" onMouseDown={(e) => e.preventDefault()} onClick={fn}>
              <Icon name={icon} size={18} />
              {label}
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!panel} onClose={() => setPanel(null)} label="Análisis">
        {panel && <AnalysisPanel {...panelProps} tab={panel} onTab={setPanel} />}
      </Sheet>

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
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Alineación</span>
            <Seg
              label="Alineación"
              value={poem.align}
              onChange={(align) => updatePoem(poem.id, { align })}
              options={[
                ['left', 'Izquierda'],
                ['center', 'Centrada'],
              ]}
            />
          </div>
          <label className="field">
            Tamaño de letra: {settings.editorSize}px
            <input type="range" min={16} max={30} value={settings.editorSize} onChange={(e) => setSettings({ editorSize: Number(e.target.value) })} />
          </label>
          <div>
            <MenuRow icon="book" label="Añadir a un libro" onClick={() => (setMenu(false), setLibroSheet(true))} />
            <MenuRow icon="canvas" label="Llevar al lienzo (imagen o vídeo)" onClick={() => (setMenu(false), irLienzo())} />
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
            <MenuRow
              icon="download"
              label="Exportar como texto (.txt)"
              onClick={async () => {
                const t = poemTitle({ title, text });
                await guardarArchivo(new Blob([`${t}\n\n${text}\n`], { type: 'text/plain' }), nombreArchivo(t, 'txt'), { compartir: true });
              }}
            />
            <MenuRow
              icon="trash"
              label="Eliminar poema"
              danger
              onClick={async () => {
                if (!confirm('¿Eliminar este poema? No se puede deshacer (salvo que tengas una copia de seguridad).')) return;
                setMenu(false);
                await deletePoem(poem.id);
                toast('Poema eliminado');
                navigate('/');
              }}
            />
          </div>
        </div>
      </Sheet>

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

function MenuRow({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className="list-row" onClick={onClick} style={danger ? { color: '#c2334a' } : undefined}>
      <Icon name={icon} size={19} />
      <span className="grow">{label}</span>
    </button>
  );
}

function HistorialSheet({ open, onClose, poemId, onRestaurar }: { open: boolean; onClose: () => void; poemId: string; onRestaurar: (t: string, ti: string) => void }) {
  const versiones = useLiveQuery(() => (open ? db.versions.where('poemId').equals(poemId).reverse().sortBy('at') : []), [open, poemId]) ?? [];
  const [ver, setVer] = useState<number | null>(null);
  return (
    <Sheet open={open} onClose={onClose} title="Historial">
      {versiones.length === 0 && <p className="empty">Todavía no hay versiones guardadas. Se crea una cada 10 minutos de escritura y al salir del poema.</p>}
      <div className="stack" style={{ gap: 8 }}>
        {versiones.map((v) => (
          <div key={v.id} className="card pad" style={{ boxShadow: 'none' }}>
            <button className="row" style={{ width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setVer(ver === v.id ? null : v.id!)} aria-expanded={ver === v.id}>
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
