import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  createBook,
  db,
  libroCompleto,
  patchLibro,
  poemTitle,
  uid,
  type Book,
  type BookCover,
  type BookLayout,
  type CoverStyle,
  type Licencia,
  type LibroCompleto,
  type Poem,
} from '../db/db';
import { nombreArchivo } from '../db/backup';
import { Icon } from '../components/Icon';
import { Seg, Sheet, Toggle, TopBar, useConfirmar } from '../components/ui';
import { useFeather } from '../components/Feather';
import { elegirArchivo, guardarArchivo } from '../lib/download';
import { useDebounced, useToast } from '../lib/hooks';
import { ESTILOS, FUENTES, cargarPluma, type StyleId } from '../export/lienzo';
import { dibujarCubierta, prepararCubierta, type Cara } from '../export/portada';
import { normal } from './Home';

export function Books() {
  const [, navigate] = useLocation();
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  return (
    <main className="screen">
      <TopBar title="Mis libros">
        <button className="icon-btn outlined" aria-label="Nuevo libro" onClick={async () => navigate(`/libros/${await createBook()}`)}>
          <Icon name="plus" size={19} />
        </button>
      </TopBar>
      <p className="muted" style={{ marginTop: 4 }}>
        Agrupa tus poemas en poemarios, diseña la cubierta, completa las páginas del libro y expórtalo listo para imprenta o como libro electrónico.
      </p>
      <div className="libros-grid" style={{ marginTop: 18 }}>
        {books.length === 0 && (
          <div className="card pad stack" style={{ alignItems: 'center', textAlign: 'center', gridColumn: '1 / -1' }}>
            <p className="muted" style={{ margin: 0 }}>
              Todavía no hay ningún poemario.
            </p>
            <button className="btn primary" onClick={async () => navigate(`/libros/${await createBook()}`)}>
              <Icon name="plus" size={18} /> Crear mi primer libro
            </button>
          </div>
        )}
        {books.map((b) => {
          const full = libroCompleto(b);
          return (
            <Link key={b.id} href={`/libros/${b.id}`} className="libro-item">
              <Portada book={full} ancho={150} />
              <span className="serif" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.15 }}>
                {b.title}
              </span>
              <span className="meta">{b.parts.reduce((a, p) => a + p.poemIds.length, 0)} poemas</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

// Miniatura de la cubierta real (la misma que se exporta).
export function Portada({ book, ancho, cara = 'front' }: { book: LibroCompleto; ancho: number; cara?: Cara }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ratio = book.layout.page === 'a4' ? 297 / 210 : book.layout.page === '13x20' ? 200 / 130 : 210 / 148;
  const firma = JSON.stringify([book.title, book.subtitle, book.author, book.cover, book.back, book.legal.publisher, book.legal.isbn, book.layout.page, cara]);
  useEffect(() => {
    let vivo = true;
    Promise.all([prepararCubierta(book), cargarPluma()]).then(([img, pluma]) => {
      const c = ref.current;
      if (!vivo || !c) return;
      const dpr = Math.min(devicePixelRatio, 2);
      c.width = Math.round(ancho * dpr);
      c.height = Math.round(ancho * ratio * dpr);
      dibujarCubierta(c.getContext('2d')!, book, c.width, c.height, cara, img, pluma);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, ancho]);
  return <canvas ref={ref} className="portada" style={{ width: ancho, height: ancho * ratio }} role="img" aria-label={`${cara === 'front' ? 'Cubierta' : 'Contracubierta'} de ${book.title}`} />;
}

type Tab = 'estructura' | 'cubierta' | 'paginas' | 'creditos' | 'maquetacion';

export function BookDetail({ id }: { id: string }) {
  const book = useLiveQuery(() => db.books.get(id).then((b) => b ?? null), [id]);
  const poems = useLiveQuery(() => db.poems.toArray(), []) ?? [];
  if (book === undefined) return <main className="screen" />;
  if (book === null)
    return (
      <main className="screen">
        <p className="empty">Este libro ya no existe.</p>
        <Link href="/libros" className="btn block">
          Ver mis libros
        </Link>
      </main>
    );
  return <BookEditor book={libroCompleto(book)} poems={poems} />;
}

export function useExportarLibro(book: LibroCompleto | null, poems: Poem[]) {
  const toast = useToast();
  const feather = useFeather();
  const [exportando, setExportando] = useState('');
  const porId = useMemo(() => new Map(poems.map((p) => [p.id, p])), [poems]);
  const total = book ? book.parts.reduce((a, p) => a + p.poemIds.filter((i) => porId.has(i)).length, 0) : 0;
  const exportar = async (tipo: 'pdf' | 'epub' | 'cubierta') => {
    if (!book) return;
    if (!total && tipo !== 'cubierta') {
      toast('Añade algún poema al libro antes de exportarlo');
      return;
    }
    setExportando(tipo);
    try {
      const mod = await import('../export/libro');
      if (tipo === 'cubierta') {
        await guardarArchivo(await mod.exportarCubiertaPng(book, 'front'), nombreArchivo(`${book.title}-cubierta`, 'png'), { compartir: true });
      } else {
        const blob = tipo === 'pdf' ? await mod.exportarLibroPdf(book, porId) : await mod.exportarEpub(book, porId);
        await guardarArchivo(blob, nombreArchivo(book.title, tipo), { compartir: true });
      }
      feather.celebrate();
      toast(tipo === 'pdf' ? 'PDF para imprenta listo' : tipo === 'epub' ? 'ePub listo' : 'Cubierta lista');
    } catch (e) {
      toast(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      setExportando('');
    }
  };
  return { exportar, exportando, total, porId };
}

function BookEditor({ book, poems }: { book: LibroCompleto; poems: Poem[] }) {
  const [, navigate] = useLocation();
  const confirmar = useConfirmar();
  const [tab, setTab] = useState<Tab>('estructura');
  const [anadir, setAnadir] = useState<string | null>(null);
  const { exportar, exportando, total, porId } = useExportarLibro(book, poems);

  return (
    <main className="screen">
      <TopBar back="/libros" title="Poemario" />
      <div className="row" style={{ gap: 16, marginTop: 10, alignItems: 'stretch' }}>
        <button className="portada-boton" onClick={() => setTab('cubierta')} aria-label="Diseñar la cubierta">
          <Portada book={book} ancho={110} />
        </button>
        <div className="grow stack" style={{ gap: 6, minWidth: 0 }}>
          <span className="serif" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1 }}>
            {book.title}
          </span>
          <span className="meta">
            {book.parts.length} {book.parts.length === 1 ? 'parte' : 'partes'} · {total} poemas · {book.layout.page === '13x20' ? '13×20 cm' : book.layout.page.toUpperCase()}
          </span>
          <div className="grow" />
          <Link href={`/libros/${book.id}/vista`} className="btn primary small" style={{ alignSelf: 'flex-start' }}>
            <Icon name="eye" size={16} /> Ver el libro
          </Link>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn small" onClick={() => exportar('pdf')} disabled={!!exportando}>
              <Icon name="download" size={15} /> {exportando === 'pdf' ? 'Creando…' : 'PDF'}
            </button>
            <button className="btn small" onClick={() => exportar('epub')} disabled={!!exportando}>
              {exportando === 'epub' ? 'Creando…' : 'ePub'}
            </button>
          </div>
        </div>
      </div>

      <div className="chips" role="tablist" style={{ marginTop: 22 }}>
        {(
          [
            ['estructura', 'Estructura'],
            ['cubierta', 'Cubierta'],
            ['paginas', 'Páginas'],
            ['creditos', 'Créditos'],
            ['maquetacion', 'Maquetación'],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} role="tab" className="chip" aria-selected={tab === t} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        {tab === 'estructura' && <Estructura book={book} porId={porId} onAnadir={setAnadir} />}
        {tab === 'cubierta' && <Cubierta book={book} onExportar={() => exportar('cubierta')} exportando={exportando === 'cubierta'} />}
        {tab === 'paginas' && <Paginas book={book} />}
        {tab === 'creditos' && <Creditos book={book} />}
        {tab === 'maquetacion' && <Maquetacion book={book} />}
      </div>

      <button
        className="btn danger block"
        style={{ marginTop: 32 }}
        onClick={async () => {
          if (!(await confirmar('¿Eliminar este libro?', 'Los poemas no se borran: siguen en tu biblioteca.'))) return;
          await db.books.delete(book.id);
          navigate('/libros');
        }}
      >
        <Icon name="trash" size={17} /> Eliminar libro
      </button>

      <AnadirPoemas book={book} poems={poems} partId={anadir} onClose={() => setAnadir(null)} />
    </main>
  );
}

// Campo de texto con guardado diferido (no pierde el foco ni las letras al escribir deprisa).
function Campo({
  label,
  valor,
  onGuardar,
  multilinea,
  placeholder,
  serif,
  filas = 4,
  ayuda,
}: {
  label: string;
  valor: string;
  onGuardar: (v: string) => void;
  multilinea?: boolean;
  placeholder?: string;
  serif?: boolean;
  filas?: number;
  ayuda?: string;
}) {
  const [v, setV] = useState(valor);
  const [guardar] = useDebounced(onGuardar, 400);
  const cambiar = (x: string) => {
    setV(x);
    guardar(x);
  };
  return (
    <label className="field">
      {label}
      {multilinea ? (
        <textarea className={`textarea ${serif ? 'serif' : ''}`} style={serif ? { fontSize: 18 } : undefined} rows={filas} value={v} onChange={(e) => cambiar(e.target.value)} placeholder={placeholder} />
      ) : (
        <input className="input" value={v} onChange={(e) => cambiar(e.target.value)} placeholder={placeholder} />
      )}
      {ayuda && <span className="meta">{ayuda}</span>}
    </label>
  );
}

function Estructura({ book, porId, onAnadir }: { book: LibroCompleto; porId: Map<string, Poem>; onAnadir: (partId: string) => void }) {
  const confirmar = useConfirmar();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const setParts = (fn: (parts: Book['parts']) => Book['parts']) => patchLibro(book.id, (b) => ({ parts: fn(b.parts) }));
  const moverParte = (i: number, d: -1 | 1) => setParts((p) => arrayMove(p, i, i + d));

  return (
    <div className="stack" style={{ gap: 22 }}>
      {book.parts.map((parte, pi) => {
        const ids = parte.poemIds.filter((i) => porId.has(i));
        const onDragEnd = (e: DragEndEvent) => {
          if (!e.over || e.active.id === e.over.id) return;
          const from = ids.indexOf(String(e.active.id));
          const to = ids.indexOf(String(e.over.id));
          setParts((ps) => ps.map((p) => (p.id === parte.id ? { ...p, poemIds: arrayMove(ids, from, to) } : p)));
        };
        return (
          <section key={parte.id} className="stack" style={{ gap: 8 }}>
            <div className="row">
              <span className="faint" style={{ fontSize: 13, width: 26 }}>
                {['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][pi] ?? pi + 1}
              </span>
              <TituloParte valor={parte.title} onGuardar={(title) => setParts((ps) => ps.map((p) => (p.id === parte.id ? { ...p, title } : p)))} indice={pi} />
              <button className="icon-btn" aria-label="Subir parte" disabled={pi === 0} onClick={() => moverParte(pi, -1)}>
                <Icon name="up" size={18} />
              </button>
              <button className="icon-btn" aria-label="Bajar parte" disabled={pi === book.parts.length - 1} onClick={() => moverParte(pi, 1)}>
                <Icon name="down" size={18} />
              </button>
              <button
                className="icon-btn"
                aria-label="Eliminar parte"
                onClick={async () => {
                  if (book.parts.length === 1) return;
                  if (ids.length && !(await confirmar('¿Quitar esta parte?', 'Sus poemas seguirán en tu biblioteca.', 'Quitar'))) return;
                  setParts((ps) => ps.filter((p) => p.id !== parte.id));
                }}
                disabled={book.parts.length === 1}
              >
                <Icon name="trash" size={17} />
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className="stack" style={{ gap: 6 }}>
                  {ids.length === 0 && <p className="meta" style={{ margin: 0 }}>Esta parte está vacía.</p>}
                  {ids.map((pid) => (
                    <PoemaOrdenable
                      key={pid}
                      poem={porId.get(pid)!}
                      partes={book.parts}
                      parteId={parte.id}
                      onMover={(destino) =>
                        setParts((ps) =>
                          ps.map((p) =>
                            p.id === parte.id ? { ...p, poemIds: p.poemIds.filter((x) => x !== pid) } : p.id === destino ? { ...p, poemIds: [...p.poemIds, pid] } : p,
                          ),
                        )
                      }
                      onQuitar={() => setParts((ps) => ps.map((p) => (p.id === parte.id ? { ...p, poemIds: p.poemIds.filter((x) => x !== pid) } : p)))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <button className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => onAnadir(parte.id)}>
              <Icon name="plus" size={16} /> Añadir poemas
            </button>
          </section>
        );
      })}
      <button className="btn block" onClick={() => setParts((ps) => [...ps, { id: uid(), title: `Parte ${ps.length + 1}`, poemIds: [] }])}>
        <Icon name="plus" size={18} /> Nueva parte
      </button>
      <p className="meta" style={{ margin: 0 }}>
        Mantén pulsado el asa y arrastra para reordenar. Con teclado: tabula hasta el asa, espacio y flechas.
      </p>
    </div>
  );
}

function TituloParte({ valor, onGuardar, indice }: { valor: string; onGuardar: (v: string) => void; indice: number }) {
  const [v, setV] = useState(valor);
  const [guardar] = useDebounced(onGuardar, 400);
  return (
    <input
      className="input grow"
      style={{ fontWeight: 600, minHeight: 40, padding: '6px 10px' }}
      value={v}
      aria-label={`Título de la parte ${indice + 1}`}
      onChange={(e) => {
        setV(e.target.value);
        guardar(e.target.value);
      }}
    />
  );
}

function PoemaOrdenable({
  poem,
  partes,
  parteId,
  onMover,
  onQuitar,
}: {
  poem: Poem;
  partes: Book['parts'];
  parteId: string;
  onMover: (destino: string) => void;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: poem.id });
  const [menu, setMenu] = useState(false);
  return (
    <div ref={setNodeRef} className={`sortable-item ${isDragging ? 'dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <Link href={`/escribir/${poem.id}`} className="grow serif" style={{ fontSize: 19, textDecoration: 'none', padding: '10px 0' }}>
        {poemTitle(poem)}
      </Link>
      <button className="icon-btn" aria-label="Opciones del poema en el libro" onClick={() => setMenu(true)}>
        <Icon name="more" size={18} />
      </button>
      <button className="icon-btn drag-handle" aria-label={`Arrastrar «${poemTitle(poem)}» para reordenar`} {...attributes} {...listeners}>
        <Icon name="drag" size={18} />
      </button>
      <Sheet open={menu} onClose={() => setMenu(false)} title={poemTitle(poem)}>
        {partes.length > 1 && <div className="eyebrow" style={{ margin: '6px 0' }}>Mover a</div>}
        {partes
          .filter((p) => p.id !== parteId)
          .map((p) => (
            <button key={p.id} className="list-row" onClick={() => (onMover(p.id), setMenu(false))}>
              <Icon name="book" size={18} />
              <span className="grow">{p.title}</span>
            </button>
          ))}
        <button className="list-row" style={{ color: '#c2334a' }} onClick={() => (onQuitar(), setMenu(false))}>
          <Icon name="close" size={18} />
          <span className="grow">Quitar del libro</span>
        </button>
      </Sheet>
    </div>
  );
}

function AnadirPoemas({ book, poems, partId, onClose }: { book: LibroCompleto; poems: Poem[]; partId: string | null; onClose: () => void }) {
  const enLibro = new Set(book.parts.flatMap((p) => p.poemIds));
  const [q, setQ] = useState('');
  const libres = poems
    .filter((p) => !enLibro.has(p.id))
    .filter((p) => !q.trim() || normal(`${p.title} ${p.text} ${p.tags.join(' ')}`).includes(normal(q.trim())))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSel(new Set());
    setQ('');
  }, [partId]);
  const parte = book.parts.find((p) => p.id === partId);
  return (
    <Sheet open={!!partId} onClose={onClose} title={`Añadir a ${parte?.title ?? ''}`}>
      <div className="buscador" style={{ marginBottom: 8 }}>
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar poema o tema" aria-label="Buscar poema" />
      </div>
      {libres.length === 0 && <p className="empty">{q ? 'Ningún poema coincide.' : 'Todos tus poemas ya están en este libro.'}</p>}
      {libres.map((p) => (
        <label key={p.id} className="list-row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={sel.has(p.id)}
            onChange={(e) => {
              const n = new Set(sel);
              if (e.target.checked) n.add(p.id);
              else n.delete(p.id);
              setSel(n);
            }}
            style={{ width: 20, height: 20, accentColor: '#6f66f2' }}
          />
          <span className="grow serif" style={{ fontSize: 19 }}>
            {poemTitle(p)}
          </span>
          <span className="meta">{p.tags.join(', ') || p.status}</span>
        </label>
      ))}
      {libres.length > 0 && (
        <button
          className="btn primary block"
          style={{ marginTop: 14 }}
          disabled={!sel.size}
          onClick={async () => {
            await patchLibro(book.id, (b) => ({ parts: b.parts.map((p) => (p.id === partId ? { ...p, poemIds: [...p.poemIds, ...sel] } : p)) }));
            onClose();
          }}
        >
          Añadir {sel.size || ''} {sel.size === 1 ? 'poema' : 'poemas'}
        </button>
      )}
    </Sheet>
  );
}

const ESTILOS_CUBIERTA: [CoverStyle, string, string][] = [
  ['plata', 'Plata', 'linear-gradient(160deg, #f6f8fb 0%, #d3d9e3 60%, #a9b2c2 100%)'],
  ['papel', 'Papel', '#f2eee5'],
  ['noche', 'Noche', 'radial-gradient(120% 90% at 72% 18%, #2f4677 0%, #14203d 50%, #070b16 100%)'],
  ['tinta', 'Tinta', 'radial-gradient(70% 70% at 12% 88%, rgba(99,230,226,0.45), transparent 60%), radial-gradient(70% 70% at 90% 12%, rgba(212,140,242,0.5), transparent 60%), linear-gradient(135deg, #151236 0%, #26195a 55%, #0e3140 100%)'],
];

async function comprimirImagen(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const s = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Cubierta({ book, onExportar, exportando }: { book: LibroCompleto; onExportar: () => void; exportando: boolean }) {
  const [cara, setCara] = useState<Cara>('front');
  const c = book.cover;
  const setCover = (patch: Partial<BookCover>) => patchLibro(book.id, (b) => ({ cover: { ...b.cover, ...patch } }));
  return (
    <div className="cubierta-layout">
      <div className="stack cubierta-previa" style={{ alignItems: 'center', gap: 10 }}>
        <Portada book={book} ancho={230} cara={cara} />
        <Seg
          label="Cara"
          value={cara}
          onChange={setCara}
          options={[
            ['front', 'Cubierta'],
            ['back', 'Contracubierta'],
          ]}
        />
        <button className="btn small" onClick={onExportar} disabled={exportando}>
          <Icon name="image" size={15} /> {exportando ? 'Creando…' : 'Descargar cubierta (PNG)'}
        </button>
      </div>
      <div className="stack" style={{ gap: 18 }}>
        <Campo label="Título" valor={book.title} onGuardar={(title) => patchLibro(book.id, () => ({ title: title || 'Sin título' }))} />
        <Campo label="Subtítulo" valor={book.subtitle} onGuardar={(subtitle) => patchLibro(book.id, () => ({ subtitle }))} placeholder="Opcional" />
        <Campo label="Autor o autora" valor={book.author} onGuardar={(author) => patchLibro(book.id, () => ({ author }))} />

        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Fondo</span>
          <div className="chips" style={{ gap: 10 }}>
            {ESTILOS_CUBIERTA.map(([s, l, bg]) => (
              <button key={s} className="estilo" aria-pressed={c.style === s} onClick={() => setCover({ style: s })}>
                <span className="estilo-muestra" style={{ background: bg, color: ESTILOS[s as StyleId].text }}>
                  Aa
                </span>
                <span className="estilo-nombre">{l}</span>
              </button>
            ))}
            <label className="estilo" aria-pressed={c.style === 'color'}>
              <span className="estilo-muestra" style={{ background: c.color, color: '#fff', position: 'relative' }}>
                <Icon name="sparkle" size={18} />
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) => setCover({ style: 'color', color: e.target.value })}
                  onClick={() => setCover({ style: 'color' })}
                  aria-label="Color de la cubierta"
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                />
              </span>
              <span className="estilo-nombre">Color</span>
            </label>
            <button
              className="estilo"
              aria-pressed={c.style === 'imagen'}
              onClick={async () => {
                if (c.image && c.style !== 'imagen') return setCover({ style: 'imagen' });
                const file = await elegirArchivo('image/*');
                if (file) setCover({ style: 'imagen', image: await comprimirImagen(file) });
              }}
            >
              <span className="estilo-muestra" style={c.image ? { backgroundImage: `url(${c.image})` } : { background: 'linear-gradient(135deg,#9aa3b5,#c3cad6)' }}>
                {!c.image && <Icon name="upload" size={18} />}
              </span>
              <span className="estilo-nombre">Imagen</span>
            </button>
          </div>
          {c.style === 'imagen' && (
            <button
              className="btn small ghost"
              style={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                const file = await elegirArchivo('image/*');
                if (file) setCover({ style: 'imagen', image: await comprimirImagen(file) });
              }}
            >
              Cambiar imagen
            </button>
          )}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Letra del título</span>
          <div className="chips">
            {(Object.keys(FUENTES) as BookCover['font'][]).map((k) => (
              <button key={k} className="chip" aria-pressed={c.font === k} onClick={() => setCover({ font: k })} style={{ fontFamily: `"${FUENTES[k].family}"`, fontSize: 15 }}>
                {FUENTES[k].label}
              </button>
            ))}
          </div>
        </div>
        <div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 14 }}>Posición del título</span>
          <Seg
            label="Posición del título"
            value={c.layout}
            onChange={(layout) => setCover({ layout })}
            options={[
              ['arriba', 'Arriba'],
              ['centrado', 'Centro'],
              ['abajo', 'Abajo'],
            ]}
          />
        </div>
        <Toggle label="Pluma decorativa" checked={c.feather} onChange={(feather) => setCover({ feather })} />

        <span className="eyebrow" style={{ marginTop: 6 }}>
          Contracubierta
        </span>
        <Campo
          label="Sinopsis"
          valor={book.back.blurb}
          onGuardar={(blurb) => patchLibro(book.id, (b) => ({ back: { ...b.back, blurb } }))}
          multilinea
          serif
          placeholder="Unas líneas que inviten a leer el libro…"
        />
        <Campo label="Sobre el autor (breve)" valor={book.back.bio} onGuardar={(bio) => patchLibro(book.id, (b) => ({ back: { ...b.back, bio } }))} multilinea filas={3} />
        <Toggle label="Reservar hueco para el código de barras" checked={book.back.barcode} onChange={(barcode) => patchLibro(book.id, (b) => ({ back: { ...b.back, barcode } }))} />
      </div>
    </div>
  );
}

function Paginas({ book }: { book: LibroCompleto }) {
  const setExtra = (k: keyof LibroCompleto['extras']) => (v: string) => patchLibro(book.id, (b) => ({ extras: { ...b.extras, [k]: v } }));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Las páginas vacías no aparecen en el libro. El orden es el clásico: portadilla, portada, créditos, dedicatoria, epígrafe, índice, prólogo, poemas,
        agradecimientos, sobre el autor y colofón.
      </p>
      <Campo label="Dedicatoria" valor={book.dedication} onGuardar={(dedication) => patchLibro(book.id, () => ({ dedication }))} multilinea serif filas={3} placeholder="A quien…" />
      <Campo label="Epígrafe (cita inicial)" valor={book.extras.epigraph} onGuardar={setExtra('epigraph')} multilinea serif filas={3} />
      <Campo label="Autor de la cita" valor={book.extras.epigraphAuthor} onGuardar={setExtra('epigraphAuthor')} placeholder="Opcional" />
      <Campo label="Prólogo" valor={book.extras.prologue} onGuardar={setExtra('prologue')} multilinea serif filas={6} />
      <Campo label="Agradecimientos" valor={book.extras.acknowledgements} onGuardar={setExtra('acknowledgements')} multilinea serif filas={4} />
      <Campo label="Sobre el autor (página final)" valor={book.extras.aboutAuthor} onGuardar={setExtra('aboutAuthor')} multilinea serif filas={4} />
      <Campo
        label="Colofón"
        valor={book.extras.colophon}
        onGuardar={setExtra('colophon')}
        multilinea
        serif
        filas={3}
        placeholder="Si lo dejas vacío: «Este libro se compuso en Cormorant Garamond y se terminó de maquetar en … con Pluma Plateada.»"
      />
    </div>
  );
}

const LICENCIAS: [Licencia, string][] = [
  ['reservados', 'Todos los derechos reservados'],
  ['cc-by', 'CC BY'],
  ['cc-by-sa', 'CC BY-SA'],
  ['cc-by-nc', 'CC BY-NC'],
  ['cc-by-nc-nd', 'CC BY-NC-ND'],
];

function Creditos({ book }: { book: LibroCompleto }) {
  const setLegal = (k: keyof LibroCompleto['legal']) => (v: string) => patchLibro(book.id, (b) => ({ legal: { ...b.legal, [k]: v } }));
  const [texto, setTexto] = useState<string[]>([]);
  useEffect(() => {
    import('../export/maquetaLibro').then((m) => setTexto(m.textoCreditos(book)));
  }, [book]);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        La página de créditos va en el reverso de la portada, con los datos legales de la edición.
      </p>
      <div className="grid-2">
        <Campo label="Año" valor={book.legal.year} onGuardar={setLegal('year')} />
        <Campo label="Edición" valor={book.legal.edition} onGuardar={setLegal('edition')} placeholder="Primera edición" />
      </div>
      <Campo label="Editorial o sello" valor={book.legal.publisher} onGuardar={setLegal('publisher')} placeholder="Vacío: «Edición de autor»" />
      <div className="grid-2">
        <Campo label="ISBN" valor={book.legal.isbn} onGuardar={setLegal('isbn')} placeholder="978-…" />
        <Campo label="Depósito legal" valor={book.legal.deposito} onGuardar={setLegal('deposito')} placeholder="M-0000-2026" />
      </div>
      <Campo label="Diseño de cubierta" valor={book.legal.coverDesign} onGuardar={setLegal('coverDesign')} placeholder="Opcional" />
      <Campo label="Impreso en" valor={book.legal.printedIn} onGuardar={setLegal('printedIn')} placeholder="España" />
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Derechos</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {LICENCIAS.map(([v, l]) => (
            <button key={v} className="chip" aria-pressed={book.legal.rights === v} onClick={() => setLegal('rights')(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <Campo label="Texto adicional" valor={book.legal.extra} onGuardar={setLegal('extra')} multilinea filas={3} placeholder="Créditos de fotografía, agradecimientos institucionales…" />
      <div className="card pad creditos-previa" aria-label="Así quedará la página de créditos">
        {texto.map((l, i) => (l ? <p key={i}>{l}</p> : <br key={i} />))}
      </div>
    </div>
  );
}

function Maquetacion({ book }: { book: LibroCompleto }) {
  const L = book.layout;
  const set = (patch: Partial<BookLayout>) => patchLibro(book.id, (b) => ({ layout: { ...b.layout, ...patch } }));
  const fila = (titulo: string, control: React.ReactNode) => (
    <div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 14 }}>{titulo}</span>
      {control}
    </div>
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      {fila(
        'Tamaño de página',
        <Seg
          label="Tamaño de página"
          value={L.page}
          onChange={(page) => set({ page })}
          options={[
            ['a5', 'A5'],
            ['13x20', '13×20'],
            ['a4', 'A4'],
          ]}
        />,
      )}
      {fila(
        'Cuerpo de letra',
        <Seg
          label="Cuerpo de letra"
          value={String(L.fontSize) as '11' | '12' | '13'}
          onChange={(v) => set({ fontSize: Number(v) as 11 | 12 | 13 })}
          options={[
            ['11', '11 pt'],
            ['12', '12 pt'],
            ['13', '13 pt'],
          ]}
        />,
      )}
      {fila(
        'Márgenes',
        <Seg
          label="Márgenes"
          value={L.margins}
          onChange={(margins) => set({ margins })}
          options={[
            ['normal', 'Normales'],
            ['amplio', 'Amplios'],
          ]}
        />,
      )}
      {fila(
        'Posición de los poemas',
        <Seg
          label="Posición de los poemas"
          value={L.poemAlign}
          onChange={(poemAlign) => set({ poemAlign })}
          options={[
            ['bloque', 'Centrados'],
            ['izquierda', 'A la izquierda'],
          ]}
        />,
      )}
      {fila(
        'Títulos de los poemas',
        <Seg
          label="Títulos de los poemas"
          value={L.titleCase}
          onChange={(titleCase) => set({ titleCase })}
          options={[
            ['normal', 'Normal'],
            ['versalitas', 'Mayúsculas'],
          ]}
        />,
      )}
      {fila(
        'Número de página',
        <Seg
          label="Número de página"
          value={L.folio}
          onChange={(folio) => set({ folio })}
          options={[
            ['centro', 'Centro'],
            ['exterior', 'Esquina'],
          ]}
        />,
      )}
      <div>
        <Toggle label="Cubierta y contracubierta en el PDF" checked={L.includeCover} onChange={(includeCover) => set({ includeCover })} hint="Desactívalo si la imprenta pide la cubierta aparte" />
        <Toggle label="Índice" checked={L.toc} onChange={(toc) => set({ toc })} hint="Con puntos guía y número de página" />
        <Toggle label="Cada poema en página nueva" checked={L.newPagePerPoem} onChange={(newPagePerPoem) => set({ newPagePerPoem })} />
        <Toggle label="Página de título para cada parte" checked={L.partPages} onChange={(partPages) => set({ partPages })} />
        <Toggle label="Cabeceras con el título del libro y de la parte" checked={L.runningHeads} onChange={(runningHeads) => set({ runningHeads })} />
        <Toggle label="Filete bajo el título de cada poema" checked={L.ornament} onChange={(ornament) => set({ ornament })} />
        <Toggle label="Números de página" checked={L.pageNumbers} onChange={(pageNumbers) => set({ pageNumbers })} />
      </div>
      <p className="meta" style={{ margin: 0 }}>
        El PDF lleva Cormorant Garamond incrustada, márgenes interiores más anchos para la encuadernación y las secciones empiezan en página impar.
      </p>
    </div>
  );
}
