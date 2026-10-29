import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { createPoem, db, poemTitle, uid, type Book, type Poem } from '../db/db';
import { analizarPoema, type Analisis } from '../poesia';
import { FeatherSlot } from '../components/Feather';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/ui';
import { haceCuanto, useSettings, useToast } from '../lib/hooks';

type Tab = 'poemas' | 'ideas' | 'libros';

const SEMANA = 7 * 24 * 3600 * 1000;

function saludo() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return 'Buenos días';
  if (h >= 13 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// ───────── Biblioteca: filtros, agrupación y orden ─────────

interface Vista {
  estado: 'todos' | 'borrador' | 'terminado';
  temas: string[];
  libro: 'todos' | 'con' | 'sin' | string;
  fecha: 'siempre' | '7d' | 'mes' | 'anio';
  forma: string; // 'todas' o el nombre de una forma
  agrupar: 'nada' | 'tema' | 'mes' | 'libro' | 'estado' | 'forma';
  orden: 'recientes' | 'antiguos' | 'titulo' | 'largos';
}

const VISTA_INICIAL: Vista = { estado: 'todos', temas: [], libro: 'todos', fecha: 'siempre', forma: 'todas', agrupar: 'nada', orden: 'recientes' };
const CLAVE_VISTA = 'pluma-biblioteca';

function leerVista(): Vista {
  try {
    return { ...VISTA_INICIAL, ...JSON.parse(localStorage.getItem(CLAVE_VISTA) ?? '{}') };
  } catch {
    return VISTA_INICIAL;
  }
}

const formaCorta = (a: Analisis) => a.forma.replace(/ \(en curso\)/, '');

export function PoemCard({ p, analisis, libros }: { p: Poem; analisis?: Analisis; libros?: string[] }) {
  const preview = p.text
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 2)
    .join('\n');
  const a = useMemo(() => analisis ?? analizarPoema(p.text), [p.text, analisis]);
  return (
    <Link href={`/escribir/${p.id}`} className="card poem-card">
      <span className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="title">{poemTitle(p)}</span>
        {p.status === 'borrador' && <span className="estado-pill">Borrador</span>}
      </span>
      <span className="preview">{preview || 'Poema vacío'}</span>
      {(p.tags.length > 0 || (libros && libros.length > 0)) && (
        <span className="row wrap" style={{ gap: 4 }}>
          {p.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
          {libros?.map((l) => (
            <span key={l} className="tag libro">
              <Icon name="book" size={11} /> {l}
            </span>
          ))}
        </span>
      )}
      <span className="meta">
        {a.stats.versos} versos · {formaCorta(a).toLowerCase()} · {haceCuanto(p.updatedAt)}
      </span>
    </Link>
  );
}

export function Home() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const [settings] = useSettings();
  const [tab, setTab] = useState<Tab>('poemas');
  const [q, setQ] = useState('');
  const [vista, setVista] = useState<Vista>(leerVista);
  const [hoja, setHoja] = useState<null | 'filtros' | 'agrupar' | 'orden'>(null);
  const [idea, setIdea] = useState('');
  const poems = useLiveQuery(() => db.poems.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const ideas = useLiveQuery(() => db.ideas.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().toArray(), []) ?? [];

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_VISTA, JSON.stringify(vista));
    } catch {
      /* preferencia opcional */
    }
  }, [vista]);

  const analisis = useMemo(() => new Map(poems.map((p) => [p.id, analizarPoema(p.text)])), [poems]);
  const librosDe = useMemo(() => {
    const m = new Map<string, Book[]>();
    books.forEach((b) => b.parts.forEach((pt) => pt.poemIds.forEach((id) => m.set(id, [...(m.get(id) ?? []), b].filter((x, i, arr) => arr.indexOf(x) === i)))));
    return m;
  }, [books]);
  const temas = useMemo(() => [...new Set(poems.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'es')), [poems]);
  const formas = useMemo(() => [...new Set([...analisis.values()].filter((a) => a.stats.versos).map(formaCorta))].sort(), [analisis]);

  const ultimo = poems[0];
  const analisisUltimo = ultimo ? analisis.get(ultimo.id) : null;
  const recordarCopia =
    settings.remindBackup && poems.length > 0 && Date.now() - (settings.lastBackupAt ?? Math.min(...poems.map((p) => p.createdAt))) > SEMANA;

  // Filtrado + búsqueda en tiempo real.
  const filtrados = useMemo(() => {
    const ahora = new Date();
    const desde =
      vista.fecha === '7d'
        ? Date.now() - SEMANA
        : vista.fecha === 'mes'
          ? new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime()
          : vista.fecha === 'anio'
            ? new Date(ahora.getFullYear(), 0, 1).getTime()
            : 0;
    const consulta = normal(q.trim());
    const lista = poems.filter((p) => {
      if (vista.estado !== 'todos' && p.status !== vista.estado) return false;
      if (vista.temas.length && !vista.temas.some((t) => p.tags.includes(t))) return false;
      const enLibros = librosDe.get(p.id) ?? [];
      if (vista.libro === 'con' && !enLibros.length) return false;
      if (vista.libro === 'sin' && enLibros.length) return false;
      if (!['todos', 'con', 'sin'].includes(vista.libro) && !enLibros.some((b) => b.id === vista.libro)) return false;
      if (desde && p.updatedAt < desde) return false;
      if (vista.forma !== 'todas' && formaCorta(analisis.get(p.id)!) !== vista.forma) return false;
      if (consulta && !normal(`${p.title}\n${p.text}\n${p.tags.join(' ')}`).includes(consulta)) return false;
      return true;
    });
    const orden = {
      recientes: (a: Poem, b: Poem) => b.updatedAt - a.updatedAt,
      antiguos: (a: Poem, b: Poem) => a.createdAt - b.createdAt,
      titulo: (a: Poem, b: Poem) => poemTitle(a).localeCompare(poemTitle(b), 'es'),
      largos: (a: Poem, b: Poem) => analisis.get(b.id)!.stats.versos - analisis.get(a.id)!.stats.versos,
    }[vista.orden];
    return lista.sort(orden);
  }, [poems, vista, q, librosDe, analisis]);

  const grupos = useMemo(() => {
    if (vista.agrupar === 'nada') return [{ nombre: '', poemas: filtrados }];
    const m = new Map<string, Poem[]>();
    const add = (k: string, p: Poem) => m.set(k, [...(m.get(k) ?? []), p]);
    filtrados.forEach((p) => {
      if (vista.agrupar === 'tema') (p.tags.length ? p.tags : ['Sin tema']).forEach((t) => add(t, p));
      else if (vista.agrupar === 'libro') {
        const ls = librosDe.get(p.id) ?? [];
        (ls.length ? ls.map((b) => b.title) : ['Sin libro']).forEach((t) => add(t, p));
      } else if (vista.agrupar === 'estado') add(p.status === 'borrador' ? 'Borradores' : 'Terminados', p);
      else if (vista.agrupar === 'forma') add(formaCorta(analisis.get(p.id)!), p);
      else {
        const d = new Date(p.createdAt);
        const k = d.toLocaleDateString('es', { month: 'long', year: 'numeric' });
        add(k[0].toUpperCase() + k.slice(1), p);
      }
    });
    return [...m.entries()].map(([nombre, poemas]) => ({ nombre, poemas }));
  }, [filtrados, vista.agrupar, librosDe, analisis]);

  const activos =
    (vista.estado !== 'todos' ? 1 : 0) + vista.temas.length + (vista.libro !== 'todos' ? 1 : 0) + (vista.fecha !== 'siempre' ? 1 : 0) + (vista.forma !== 'todas' ? 1 : 0);

  const escribir = async () => navigate(`/escribir/${await createPoem()}`);
  const guardarIdea = async () => {
    if (!idea.trim()) return;
    await db.ideas.add({ id: uid(), text: idea.trim(), createdAt: Date.now() });
    setIdea('');
    toast('Idea guardada');
  };

  const sonetoEnCurso = analisisUltimo?.forma === 'Soneto (en curso)';

  return (
    <main className="screen">
      <header className="topbar">
        <span className="serif hide-desktop" style={{ fontStyle: 'italic', fontSize: 21, color: 'var(--text-2)' }}>
          Pluma Plateada
        </span>
      </header>

      <section style={{ position: 'relative', minHeight: 210, paddingTop: 34 }}>
        <FeatherSlot style={{ position: 'absolute', right: 22, top: -30, width: 110, height: 270 }} />
        <div className="eyebrow">{saludo()}</div>
        <h1 className="serif" style={{ margin: '8px 0 0', fontWeight: 500, fontSize: 40, lineHeight: 1.04, maxWidth: 250 }}>
          ¿Qué verso te ronda hoy?
        </h1>
      </section>

      {recordarCopia && (
        <Link href="/ajustes" className="card pad row" style={{ marginTop: 18, textDecoration: 'none', borderColor: 'rgba(111,102,242,0.45)' }}>
          <Icon name="shield" size={22} />
          <span className="grow" style={{ fontSize: 14 }}>
            Hace más de una semana que no haces copia. <b>Hazla ahora</b> para no perder nada.
          </span>
        </Link>
      )}

      <div className="stack" style={{ marginTop: 22 }}>
        <button className="btn primary big block" onClick={escribir}>
          <Icon name="pen" /> Escribir poema
        </button>
        {ultimo && analisisUltimo && (
          <Link href={`/escribir/${ultimo.id}`} className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="eyebrow">Continuar</span>
              <span className="meta">{haceCuanto(ultimo.updatedAt)}</span>
            </div>
            <span className="serif" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.15 }}>
              {poemTitle(ultimo)}
            </span>
            {ultimo.text.trim() && (
              <span className="serif muted" style={{ fontStyle: 'italic', fontSize: 17 }}>
                «{ultimo.text.split('\n').filter((l) => l.trim()).slice(-1)[0]}»
              </span>
            )}
            {sonetoEnCurso && (
              <div className="progress">
                <div style={{ width: `${(analisisUltimo.stats.versos / 14) * 100}%` }} />
              </div>
            )}
            <span className="meta">
              {analisisUltimo.stats.versos} versos · {analisisUltimo.forma.toLowerCase()}
              {analisisUltimo.formaDetalle ? ` · ${analisisUltimo.formaDetalle}` : ''}
            </span>
          </Link>
        )}
      </div>

      <div className="chips" role="tablist" aria-label="Secciones" style={{ marginTop: 26 }}>
        {(
          [
            ['poemas', `Poemas · ${poems.length}`],
            ['ideas', `Ideas · ${ideas.length}`],
            ['libros', `Libros · ${books.length}`],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} role="tab" className="chip" aria-selected={tab === t} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        {tab === 'poemas' && (
          <div className="stack">
            <div className="buscador">
              <Icon name="search" size={18} />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por título, verso o tema"
                aria-label="Buscar en tus poemas"
                autoComplete="off"
              />
              {q && (
                <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Borrar búsqueda" onClick={() => setQ('')}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="chip" aria-pressed={activos > 0} onClick={() => setHoja('filtros')}>
                <Icon name="filter" size={15} /> Filtrar{activos ? ` · ${activos}` : ''}
              </button>
              <button className="chip" onClick={() => setHoja('agrupar')}>
                <Icon name="group" size={15} /> {vista.agrupar === 'nada' ? 'Agrupar' : `Por ${ETIQ_AGRUPAR[vista.agrupar].toLowerCase()}`}
              </button>
              <button className="chip" onClick={() => setHoja('orden')}>
                <Icon name="sort" size={15} /> {ETIQ_ORDEN[vista.orden]}
              </button>
            </div>
            {activos > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>
                {vista.estado !== 'todos' && <Quitable texto={vista.estado === 'borrador' ? 'Borradores' : 'Terminados'} onQuitar={() => setVista({ ...vista, estado: 'todos' })} />}
                {vista.temas.map((t) => (
                  <Quitable key={t} texto={`Tema: ${t}`} onQuitar={() => setVista({ ...vista, temas: vista.temas.filter((x) => x !== t) })} />
                ))}
                {vista.libro !== 'todos' && (
                  <Quitable
                    texto={vista.libro === 'con' ? 'En algún libro' : vista.libro === 'sin' ? 'Sin libro' : `Libro: ${books.find((b) => b.id === vista.libro)?.title ?? '—'}`}
                    onQuitar={() => setVista({ ...vista, libro: 'todos' })}
                  />
                )}
                {vista.fecha !== 'siempre' && <Quitable texto={ETIQ_FECHA[vista.fecha]} onQuitar={() => setVista({ ...vista, fecha: 'siempre' })} />}
                {vista.forma !== 'todas' && <Quitable texto={vista.forma} onQuitar={() => setVista({ ...vista, forma: 'todas' })} />}
                <button className="btn small ghost" onClick={() => setVista({ ...VISTA_INICIAL, agrupar: vista.agrupar, orden: vista.orden })}>
                  Quitar filtros
                </button>
              </div>
            )}
            {poems.length === 0 && <p className="empty">Aquí aparecerán tus poemas.</p>}
            {poems.length > 0 && filtrados.length === 0 && <p className="empty">{q ? `Ningún poema contiene «${q}».` : 'Ningún poema cumple estos filtros.'}</p>}
            {grupos.map((g) => (
              <section key={g.nombre || 'todos'} className="stack" style={{ gap: 10 }}>
                {g.nombre && (
                  <div className="grupo-titulo">
                    <span>{g.nombre}</span>
                    <span className="meta">{g.poemas.length}</span>
                  </div>
                )}
                {g.poemas.map((p) => (
                  <PoemCard key={`${g.nombre}-${p.id}`} p={p} analisis={analisis.get(p.id)} libros={vista.agrupar === 'libro' ? undefined : librosDe.get(p.id)?.map((b) => b.title)} />
                ))}
              </section>
            ))}
          </div>
        )}

        {tab === 'ideas' && (
          <div className="stack">
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                guardarIdea();
              }}
            >
              <label className="sr-only" htmlFor="idea">
                Nueva idea
              </label>
              <input id="idea" className="input grow" placeholder="Apunta una idea, una imagen, un verso suelto…" value={idea} onChange={(e) => setIdea(e.target.value)} />
              <button className="btn primary" type="submit" disabled={!idea.trim()}>
                Guardar
              </button>
            </form>
            {ideas.length === 0 && <p className="empty">Las ideas rápidas se guardan aquí para cuando quieras escribir.</p>}
            {ideas.map((i) => (
              <div key={i.id} className="card pad stack" style={{ gap: 8 }}>
                <span className="serif" style={{ fontSize: 19, whiteSpace: 'pre-wrap' }}>
                  {i.text}
                </span>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="meta">{haceCuanto(i.createdAt)}</span>
                  <div className="row">
                    <button
                      className="btn small"
                      onClick={async () => {
                        const id = await createPoem(i.text);
                        await db.ideas.delete(i.id);
                        navigate(`/escribir/${id}`);
                      }}
                    >
                      Convertir en poema
                    </button>
                    <button className="icon-btn" aria-label="Borrar idea" onClick={() => db.ideas.delete(i.id)}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'libros' && (
          <div className="stack">
            {books.length === 0 && <p className="empty">Aún no tienes poemarios. Créalos desde la pestaña Libros.</p>}
            {books.map((b) => (
              <Link key={b.id} href={`/libros/${b.id}`} className="card pad row" style={{ gap: 14, textDecoration: 'none' }}>
                <div className="grow">
                  <div className="serif" style={{ fontSize: 21, fontWeight: 600 }}>
                    {b.title}
                  </div>
                  <div className="meta">
                    {b.parts.length} {b.parts.length === 1 ? 'parte' : 'partes'} · {b.parts.reduce((a, p) => a + p.poemIds.length, 0)} poemas
                  </div>
                </div>
                <Icon name="back" size={18} className="flip" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <Sheet open={hoja === 'filtros'} onClose={() => setHoja(null)} title="Filtrar poemas">
        <div className="stack" style={{ gap: 18 }}>
          <Grupo titulo="Estado">
            {(
              [
                ['todos', 'Todos'],
                ['borrador', 'Borradores'],
                ['terminado', 'Terminados'],
              ] as [Vista['estado'], string][]
            ).map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={vista.estado === v} onClick={() => setVista({ ...vista, estado: v })}>
                {l}
              </button>
            ))}
          </Grupo>
          <Grupo titulo="Temas">
            {temas.length === 0 && <span className="meta">Añade temas a tus poemas desde el editor (menú · Temas).</span>}
            {temas.map((t) => (
              <button
                key={t}
                className="chip"
                aria-pressed={vista.temas.includes(t)}
                onClick={() => setVista({ ...vista, temas: vista.temas.includes(t) ? vista.temas.filter((x) => x !== t) : [...vista.temas, t] })}
              >
                {t}
              </button>
            ))}
          </Grupo>
          <Grupo titulo="Libros">
            {[
              ['todos', 'Todos'],
              ['con', 'En algún libro'],
              ['sin', 'Sin libro'],
              ...books.map((b) => [b.id, b.title]),
            ].map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={vista.libro === v} onClick={() => setVista({ ...vista, libro: v })}>
                {l}
              </button>
            ))}
          </Grupo>
          <Grupo titulo="Fecha">
            {(Object.keys(ETIQ_FECHA) as Vista['fecha'][]).map((v) => (
              <button key={v} className="chip" aria-pressed={vista.fecha === v} onClick={() => setVista({ ...vista, fecha: v })}>
                {ETIQ_FECHA[v]}
              </button>
            ))}
          </Grupo>
          <Grupo titulo="Forma">
            {['todas', ...formas].map((f) => (
              <button key={f} className="chip" aria-pressed={vista.forma === f} onClick={() => setVista({ ...vista, forma: f })}>
                {f === 'todas' ? 'Todas' : f}
              </button>
            ))}
          </Grupo>
          <button className="btn primary block" onClick={() => setHoja(null)}>
            Ver {filtrados.length} {filtrados.length === 1 ? 'poema' : 'poemas'}
          </button>
        </div>
      </Sheet>

      <Sheet open={hoja === 'agrupar'} onClose={() => setHoja(null)} title="Agrupar por">
        {(Object.keys(ETIQ_AGRUPAR) as Vista['agrupar'][]).map((v) => (
          <button key={v} className="list-row" onClick={() => (setVista({ ...vista, agrupar: v }), setHoja(null))}>
            <span className="grow">{ETIQ_AGRUPAR[v]}</span>
            {vista.agrupar === v && <Icon name="check" size={18} />}
          </button>
        ))}
      </Sheet>

      <Sheet open={hoja === 'orden'} onClose={() => setHoja(null)} title="Ordenar">
        {(Object.keys(ETIQ_ORDEN) as Vista['orden'][]).map((v) => (
          <button key={v} className="list-row" onClick={() => (setVista({ ...vista, orden: v }), setHoja(null))}>
            <span className="grow">{ETIQ_ORDEN[v]}</span>
            {vista.orden === v && <Icon name="check" size={18} />}
          </button>
        ))}
      </Sheet>
    </main>
  );
}

const ETIQ_AGRUPAR: Record<Vista['agrupar'], string> = {
  nada: 'Sin agrupar',
  tema: 'Tema',
  mes: 'Mes',
  libro: 'Libro',
  estado: 'Estado',
  forma: 'Forma',
};
const ETIQ_ORDEN: Record<Vista['orden'], string> = {
  recientes: 'Recientes',
  antiguos: 'Más antiguos',
  titulo: 'Título A–Z',
  largos: 'Más largos',
};
const ETIQ_FECHA: Record<Vista['fecha'], string> = {
  siempre: 'Cualquier fecha',
  '7d': 'Últimos 7 días',
  mes: 'Este mes',
  anio: 'Este año',
};

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="eyebrow">{titulo}</span>
      <div className="row wrap" style={{ gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function Quitable({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <button className="chip" aria-pressed="true" onClick={onQuitar} aria-label={`Quitar filtro ${texto}`}>
      {texto} <Icon name="close" size={13} />
    </button>
  );
}
