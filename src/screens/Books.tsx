import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createBook, db, poemTitle, uid, updateBook, type Book, type BookLayout, type Poem } from '../db/db';
import { nombreArchivo } from '../db/backup';
import { Icon } from '../components/Icon';
import { Seg, Sheet, Toggle, TopBar, useConfirmar } from '../components/ui';
import { useFeather } from '../components/Feather';
import { guardarArchivo } from '../lib/download';
import { useDebounced, useToast } from '../lib/hooks';
import plumaImg from '../assets/pluma.png';

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
        Agrupa tus poemas en poemarios con partes, ordénalos y expórtalos listos para imprenta o como libro electrónico.
      </p>
      <div className="stack" style={{ marginTop: 18 }}>
        {books.length === 0 && (
          <div className="card pad stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              Todavía no hay ningún poemario.
            </p>
            <button className="btn primary" onClick={async () => navigate(`/libros/${await createBook()}`)}>
              <Icon name="plus" size={18} /> Crear mi primer libro
            </button>
          </div>
        )}
        {books.map((b) => (
          <Link key={b.id} href={`/libros/${b.id}`} className="card pad row" style={{ gap: 16, textDecoration: 'none' }}>
            <Cover title={b.title} small />
            <div className="grow stack" style={{ gap: 4 }}>
              <span className="serif" style={{ fontSize: 23, fontWeight: 600, lineHeight: 1.1 }}>
                {b.title}
              </span>
              {b.subtitle && <span className="muted serif" style={{ fontStyle: 'italic', fontSize: 16 }}>{b.subtitle}</span>}
              <span className="meta">
                {b.parts.length} {b.parts.length === 1 ? 'parte' : 'partes'} · {b.parts.reduce((a, p) => a + p.poemIds.length, 0)} poemas
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function Cover({ title, small }: { title: string; small?: boolean }) {
  return (
    <div className="cover" style={small ? { width: 72, height: 102 } : undefined}>
      <img src={plumaImg} alt="" />
      <span style={small ? { fontSize: 11 } : undefined}>{title}</span>
    </div>
  );
}

type Tab = 'estructura' | 'datos' | 'maquetacion';

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
  return <BookEditor book={book} poems={poems} />;
}

function BookEditor({ book, poems }: { book: Book; poems: Poem[] }) {
  const [, navigate] = useLocation();
  const toast = useToast();
  const feather = useFeather();
  const confirmar = useConfirmar();
  const [tab, setTab] = useState<Tab>('estructura');
  const [anadir, setAnadir] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'' | 'pdf' | 'epub'>('');
  const porId = useMemo(() => new Map(poems.map((p) => [p.id, p])), [poems]);
  const total = book.parts.reduce((a, p) => a + p.poemIds.filter((i) => porId.has(i)).length, 0);

  const exportar = async (tipo: 'pdf' | 'epub') => {
    if (!total) {
      toast('Añade algún poema al libro antes de exportarlo');
      return;
    }
    setExportando(tipo);
    try {
      const mod = await import('../export/libro');
      const blob = tipo === 'pdf' ? await mod.exportarLibroPdf(book, porId) : await mod.exportarEpub(book, porId);
      await guardarArchivo(blob, nombreArchivo(book.title, tipo), { compartir: true });
      feather.celebrate();
      toast(tipo === 'pdf' ? 'PDF para imprenta listo' : 'ePub listo');
    } catch (e) {
      toast(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      setExportando('');
    }
  };

  return (
    <main className="screen">
      <TopBar back="/libros" title="Poemario" />
      <div className="row" style={{ gap: 16, marginTop: 10, alignItems: 'stretch' }}>
        <Cover title={book.title} />
        <div className="grow stack" style={{ gap: 6 }}>
          <span className="serif" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1 }}>
            {book.title}
          </span>
          <span className="meta">
            {book.parts.length} {book.parts.length === 1 ? 'parte' : 'partes'} · {total} poemas · {book.layout.page.toUpperCase()}
          </span>
          <div className="grow" />
          <div className="row wrap">
            <button className="btn primary small" onClick={() => exportar('pdf')} disabled={!!exportando}>
              <Icon name="download" size={16} /> {exportando === 'pdf' ? 'Creando…' : 'PDF imprenta'}
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
            ['datos', 'Datos del libro'],
            ['maquetacion', 'Maquetación'],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} role="tab" className="chip" aria-selected={tab === t} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === 'estructura' && <Estructura book={book} porId={porId} onAnadir={setAnadir} />}
        {tab === 'datos' && <Datos book={book} />}
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

function Estructura({ book, porId, onAnadir }: { book: Book; porId: Map<string, Poem>; onAnadir: (partId: string) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const confirmar = useConfirmar();
  const setParts = (parts: Book['parts']) => updateBook(book.id, { parts });
  const moverParte = (i: number, d: -1 | 1) => setParts(arrayMove(book.parts, i, i + d));

  return (
    <div className="stack" style={{ gap: 22 }}>
      {book.parts.map((parte, pi) => {
        const ids = parte.poemIds.filter((i) => porId.has(i));
        const onDragEnd = (e: DragEndEvent) => {
          if (!e.over || e.active.id === e.over.id) return;
          const from = ids.indexOf(String(e.active.id));
          const to = ids.indexOf(String(e.over.id));
          setParts(book.parts.map((p) => (p.id === parte.id ? { ...p, poemIds: arrayMove(ids, from, to) } : p)));
        };
        return (
          <section key={parte.id} className="stack" style={{ gap: 8 }}>
            <div className="row">
              <input
                className="input grow"
                style={{ fontWeight: 600, minHeight: 40, padding: '6px 10px' }}
                value={parte.title}
                aria-label={`Título de la parte ${pi + 1}`}
                onChange={(e) => setParts(book.parts.map((p) => (p.id === parte.id ? { ...p, title: e.target.value } : p)))}
              />
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
                  setParts(book.parts.filter((p) => p.id !== parte.id));
                }}
                disabled={book.parts.length === 1}
              >
                <Icon name="trash" size={17} />
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className="stack" style={{ gap: 6 }}>
                  {ids.map((pid) => (
                    <PoemaOrdenable
                      key={pid}
                      poem={porId.get(pid)!}
                      partes={book.parts}
                      parteId={parte.id}
                      onMover={(destino) =>
                        setParts(
                          book.parts.map((p) =>
                            p.id === parte.id ? { ...p, poemIds: p.poemIds.filter((x) => x !== pid) } : p.id === destino ? { ...p, poemIds: [...p.poemIds, pid] } : p,
                          ),
                        )
                      }
                      onQuitar={() => setParts(book.parts.map((p) => (p.id === parte.id ? { ...p, poemIds: p.poemIds.filter((x) => x !== pid) } : p)))}
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
      <button className="btn block" onClick={() => setParts([...book.parts, { id: uid(), title: `Parte ${book.parts.length + 1}`, poemIds: [] }])}>
        <Icon name="plus" size={18} /> Nueva parte
      </button>
      <p className="meta" style={{ margin: 0 }}>
        Mantén pulsado y arrastra el asa para reordenar. Con teclado: tabula hasta el asa, espacio y flechas.
      </p>
    </div>
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

function AnadirPoemas({ book, poems, partId, onClose }: { book: Book; poems: Poem[]; partId: string | null; onClose: () => void }) {
  const enLibro = new Set(book.parts.flatMap((p) => p.poemIds));
  const libres = poems.filter((p) => !enLibro.has(p.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => setSel(new Set()), [partId]);
  const parte = book.parts.find((p) => p.id === partId);
  return (
    <Sheet open={!!partId} onClose={onClose} title={`Añadir a ${parte?.title ?? ''}`}>
      {libres.length === 0 && <p className="empty">Todos tus poemas ya están en este libro.</p>}
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
          <span className="meta">{p.status}</span>
        </label>
      ))}
      {libres.length > 0 && (
        <button
          className="btn primary block"
          style={{ marginTop: 14 }}
          disabled={!sel.size}
          onClick={async () => {
            await updateBook(book.id, { parts: book.parts.map((p) => (p.id === partId ? { ...p, poemIds: [...p.poemIds, ...sel] } : p)) });
            onClose();
          }}
        >
          Añadir {sel.size || ''} {sel.size === 1 ? 'poema' : 'poemas'}
        </button>
      )}
    </Sheet>
  );
}

function Datos({ book }: { book: Book }) {
  const [d, setD] = useState({ title: book.title, subtitle: book.subtitle, author: book.author, dedication: book.dedication });
  const [guardar] = useDebounced((patch: Partial<Book>) => updateBook(book.id, patch), 400);
  const campo = (k: keyof typeof d, v: string) => {
    const n = { ...d, [k]: v };
    setD(n);
    guardar(n);
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <label className="field">
        Título
        <input className="input" value={d.title} onChange={(e) => campo('title', e.target.value)} />
      </label>
      <label className="field">
        Subtítulo
        <input className="input" value={d.subtitle} onChange={(e) => campo('subtitle', e.target.value)} placeholder="Opcional" />
      </label>
      <label className="field">
        Autor o autora
        <input className="input" value={d.author} onChange={(e) => campo('author', e.target.value)} />
      </label>
      <label className="field">
        Dedicatoria
        <textarea className="textarea serif" style={{ fontSize: 18 }} value={d.dedication} onChange={(e) => campo('dedication', e.target.value)} placeholder="A quien…" />
      </label>
    </div>
  );
}

function Maquetacion({ book }: { book: Book }) {
  const L = book.layout;
  const set = (patch: Partial<BookLayout>) => updateBook(book.id, { layout: { ...L, ...patch } });
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Tamaño de página</span>
        <Seg
          label="Tamaño de página"
          value={L.page}
          onChange={(page) => set({ page })}
          options={[
            ['a5', 'A5'],
            ['13x20', '13×20 cm'],
            ['a4', 'A4'],
          ]}
        />
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Cuerpo de letra</span>
        <Seg
          label="Cuerpo de letra"
          value={String(L.fontSize) as '11' | '12' | '13'}
          onChange={(v) => set({ fontSize: Number(v) as 11 | 12 | 13 })}
          options={[
            ['11', '11 pt'],
            ['12', '12 pt'],
            ['13', '13 pt'],
          ]}
        />
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Márgenes</span>
        <Seg
          label="Márgenes"
          value={L.margins}
          onChange={(margins) => set({ margins })}
          options={[
            ['normal', 'Normales'],
            ['amplio', 'Amplios'],
          ]}
        />
      </div>
      <div>
        <Toggle label="Índice" checked={L.toc} onChange={(toc) => set({ toc })} hint="Con el número de página de cada poema" />
        <Toggle label="Cada poema en página nueva" checked={L.newPagePerPoem} onChange={(newPagePerPoem) => set({ newPagePerPoem })} />
        <Toggle label="Página de título para cada parte" checked={L.partPages} onChange={(partPages) => set({ partPages })} />
        <Toggle label="Números de página" checked={L.pageNumbers} onChange={(pageNumbers) => set({ pageNumbers })} />
      </div>
      <p className="meta" style={{ margin: 0 }}>
        El PDF lleva la letra Cormorant Garamond incrustada y márgenes interiores más anchos para la encuadernación.
      </p>
    </div>
  );
}
