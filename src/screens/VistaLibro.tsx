import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { db, libroCompleto, type LibroCompleto } from '../db/db';
import type { Maqueta, Pagina } from '../export/maquetaLibro';
import { Icon } from '../components/Icon';
import { useMedia } from '../lib/hooks';
import { useExportarLibro } from './Books';

export function VistaLibro({ id }: { id: string }) {
  const raw = useLiveQuery(() => db.books.get(id).then((b) => b ?? null), [id]);
  const poems = useLiveQuery(() => db.poems.toArray(), []);
  const book = useMemo(() => (raw ? libroCompleto(raw) : null), [raw]);
  const desktop = useMedia('(min-width: 900px)');
  const [maqueta, setMaqueta] = useState<Maqueta | null>(null);
  const [error, setError] = useState('');
  const [actual, setActual] = useState(0);
  const pista = useRef<HTMLDivElement>(null);
  const { exportar, exportando } = useExportarLibro(book, poems ?? []);

  useEffect(() => {
    if (!book || !poems) return;
    let vivo = true;
    import('../export/libro')
      .then((m) => m.maquetarParaPrevia(book, new Map(poems.map((p) => [p.id, p]))))
      .then((mq) => vivo && setMaqueta(mq))
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [book, poems]);

  // Pliegos: en pantalla ancha, página par a la izquierda e impar a la derecha, como un libro abierto.
  const pliegos = useMemo(() => {
    if (!maqueta) return [];
    if (!desktop) return maqueta.paginas.map((p) => [p]);
    const out: (Pagina | null)[][] = [];
    const interiores = maqueta.paginas.filter((p) => p.tipo === 'interior');
    const cubierta = maqueta.paginas.find((p) => p.tipo === 'cubierta');
    const contra = maqueta.paginas.find((p) => p.tipo === 'contracubierta');
    if (cubierta) out.push([cubierta]);
    out.push([null, interiores[0]]);
    for (let i = 1; i < interiores.length; i += 2) out.push([interiores[i], interiores[i + 1] ?? null]);
    if (contra) out.push([contra]);
    return out;
  }, [maqueta, desktop]);

  const ir = (i: number) => {
    const el = pista.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    const on = () => setActual(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [pliegos]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') ir(Math.min(pliegos.length - 1, actual + 1));
      if (e.key === 'ArrowLeft') ir(Math.max(0, actual - 1));
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });

  if (raw === null) return <main className="screen"><p className="empty">Este libro ya no existe.</p></main>;
  const pliego = pliegos[actual] ?? [];
  const etiqueta = pliego
    .filter(Boolean)
    .map((p) => (p!.folio ? `${p!.folio}` : p!.nombre || 'en blanco'))
    .join(' – ');

  return (
    <main className="vista-libro">
      <header className="vista-cabecera">
        <Link href={`/libros/${id}`} className="icon-btn" aria-label="Volver al libro">
          <Icon name="back" size={22} />
        </Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 20, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {book?.title ?? ''}
          </div>
          <div className="meta">{maqueta ? `${maqueta.paginas.length} páginas · ${etiqueta}` : 'Maquetando…'}</div>
        </div>
        <button className="btn small primary" onClick={() => exportar('pdf')} disabled={!!exportando || !maqueta}>
          <Icon name="download" size={15} /> {exportando === 'pdf' ? 'Creando…' : 'PDF'}
        </button>
      </header>

      {error && <p className="empty">No se pudo maquetar el libro: {error}</p>}

      <div className="vista-pista" ref={pista}>
        {maqueta &&
          book &&
          pliegos.map((pl, i) => (
            <div key={i} className="vista-pliego">
              <div className="vista-hojas" style={{ ['--ratio' as string]: maqueta.H / maqueta.W, ['--n' as string]: pl.length }}>
                {pl.map((p, k) =>
                  p ? <HojaCanvas key={k} maqueta={maqueta} pagina={p} book={book} cerca={Math.abs(i - actual) <= 2} /> : <div key={k} className="vista-hoja vacia" aria-hidden="true" />,
                )}
              </div>
            </div>
          ))}
      </div>

      <footer className="vista-pie">
        <button className="icon-btn outlined" aria-label="Página anterior" disabled={actual === 0} onClick={() => ir(actual - 1)}>
          <Icon name="chevLeft" size={20} />
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, pliegos.length - 1)}
          value={actual}
          onChange={(e) => ir(Number(e.target.value))}
          aria-label="Ir a la página"
          style={{ flex: 1, maxWidth: 420 }}
        />
        <button className="icon-btn outlined" aria-label="Página siguiente" disabled={actual >= pliegos.length - 1} onClick={() => ir(actual + 1)}>
          <Icon name="chevRight" size={20} />
        </button>
      </footer>
    </main>
  );
}

function HojaCanvas({ maqueta, pagina, book, cerca }: { maqueta: Maqueta; pagina: Pagina; book: LibroCompleto; cerca: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hecho, setHecho] = useState(false);
  useEffect(() => setHecho(false), [maqueta, pagina]);
  useEffect(() => {
    if (!cerca || hecho) return;
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(devicePixelRatio, 2);
    const ancho = c.clientWidth || 400;
    const escala = (ancho * dpr) / maqueta.W;
    c.width = Math.round(maqueta.W * escala);
    c.height = Math.round(maqueta.H * escala);
    import('../export/libro').then((m) => m.dibujarPagina(c.getContext('2d')!, maqueta, pagina, escala, book)).then(() => setHecho(true));
  }, [cerca, hecho, maqueta, pagina, book]);
  return <canvas ref={ref} className="vista-hoja" role="img" aria-label={pagina.nombre || `Página ${pagina.folio ?? ''}`} />;
}
