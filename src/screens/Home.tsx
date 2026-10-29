import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { createPoem, db, poemTitle, uid, type Poem } from '../db/db';
import { analizarPoema } from '../poesia';
import { FeatherSlot } from '../components/Feather';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/ui';
import { haceCuanto, useSettings, useToast } from '../lib/hooks';

type Tab = 'recientes' | 'borradores' | 'terminados' | 'ideas' | 'libros';

const SEMANA = 7 * 24 * 3600 * 1000;

function saludo() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return 'Buenos días';
  if (h >= 13 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function PoemCard({ p }: { p: Poem }) {
  const preview = p.text
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 2)
    .join('\n');
  const a = useMemo(() => analizarPoema(p.text), [p.text]);
  return (
    <Link href={`/escribir/${p.id}`} className="card poem-card">
      <span className="title">{poemTitle(p)}</span>
      <span className="preview">{preview || 'Poema vacío'}</span>
      <span className="meta">
        {a.stats.versos} versos · {a.forma.toLowerCase()} · {p.status === 'borrador' ? 'borrador' : 'terminado'} · {haceCuanto(p.updatedAt)}
      </span>
    </Link>
  );
}

export function Home() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const [settings] = useSettings();
  const [tab, setTab] = useState<Tab>('recientes');
  const [buscar, setBuscar] = useState(false);
  const [q, setQ] = useState('');
  const [idea, setIdea] = useState('');
  const poems = useLiveQuery(() => db.poems.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const ideas = useLiveQuery(() => db.ideas.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const ultimo = poems[0];
  const analisisUltimo = useMemo(() => (ultimo ? analizarPoema(ultimo.text) : null), [ultimo]);

  const recordarCopia =
    settings.remindBackup &&
    poems.length > 0 &&
    Date.now() - (settings.lastBackupAt ?? Math.min(...poems.map((p) => p.createdAt))) > SEMANA;

  const lista = tab === 'borradores' ? poems.filter((p) => p.status === 'borrador') : tab === 'terminados' ? poems.filter((p) => p.status === 'terminado') : poems;
  const resultados = q.trim() ? poems.filter((p) => normal(p.title + '\n' + p.text).includes(normal(q.trim()))) : [];

  const escribir = async () => navigate(`/escribir/${await createPoem()}`);
  const guardarIdea = async () => {
    if (!idea.trim()) return;
    await db.ideas.add({ id: uid(), text: idea.trim(), createdAt: Date.now() });
    setIdea('');
    toast('Idea guardada');
  };

  return (
    <main className="screen">
      <header className="topbar" style={{ justifyContent: 'space-between' }}>
        <span className="serif hide-desktop" style={{ fontStyle: 'italic', fontSize: 21, color: 'var(--text-2)' }}>
          Pluma Plateada
        </span>
        <span className="hide-mobile" />
        <button className="icon-btn outlined" onClick={() => setBuscar(true)} aria-label="Buscar poemas">
          <Icon name="search" size={19} />
        </button>
      </header>

      <section style={{ position: 'relative', minHeight: 220, paddingTop: 40 }}>
        <FeatherSlot style={{ position: 'absolute', right: 22, top: -24, width: 110, height: 270 }} />
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
            <div className="row">
              <div className="progress grow">
                <div style={{ width: `${Math.min(100, (analisisUltimo.stats.versos / Math.max(14, analisisUltimo.stats.versos)) * 100)}%` }} />
              </div>
              <span className="meta">
                {analisisUltimo.stats.versos} versos · {analisisUltimo.forma.toLowerCase()}
              </span>
            </div>
          </Link>
        )}
      </div>

      <div className="chips" role="tablist" aria-label="Secciones" style={{ marginTop: 26 }}>
        {(
          [
            ['recientes', 'Recientes'],
            ['borradores', 'Borradores'],
            ['terminados', 'Terminados'],
            ['ideas', 'Ideas'],
            ['libros', 'Libros'],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} role="tab" className="chip" aria-selected={tab === t} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        {(tab === 'recientes' || tab === 'borradores' || tab === 'terminados') && (
          <div className="stack">
            {lista.length === 0 && <p className="empty">Aquí aparecerán tus poemas.</p>}
            {lista.map((p) => (
              <PoemCard key={p.id} p={p} />
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
                <div className="cover" style={{ width: 60, height: 86 }}>
                  <span style={{ fontSize: 10 }}>{b.title}</span>
                </div>
                <div className="grow">
                  <div className="serif" style={{ fontSize: 21, fontWeight: 600 }}>
                    {b.title}
                  </div>
                  <div className="meta">
                    {b.parts.length} partes · {b.parts.reduce((a, p) => a + p.poemIds.length, 0)} poemas
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Sheet open={buscar} onClose={() => setBuscar(false)} title="Buscar">
        <input className="input" autoFocus placeholder="Título, verso o palabra" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en tus poemas" />
        <div className="stack" style={{ marginTop: 12 }}>
          {q.trim() && resultados.length === 0 && <p className="empty">Nada por aquí con «{q}».</p>}
          {resultados.map((p) => (
            <PoemCard key={p.id} p={p} />
          ))}
        </div>
      </Sheet>
    </main>
  );
}
