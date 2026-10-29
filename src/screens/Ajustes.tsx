import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, requestPersistence, type Theme } from '../db/db';
import { crearCopia, exportarTexto, importarCopia, marcarCopiaHecha, nombreArchivo } from '../db/backup';
import { Icon } from '../components/Icon';
import { Seg, Toggle, TopBar } from '../components/ui';
import { useFeather } from '../components/Feather';
import { elegirArchivo, guardarArchivo } from '../lib/download';
import { alCambiarInstalacion, esIOS, instalada, instalar, puedeInstalar } from '../lib/install';
import { haceCuanto, useSettings, useToast } from '../lib/hooks';
import plumin from '../assets/plumin.png';

const TEMAS: { id: Theme; label: string; sub: string; bg: string; fg: string }[] = [
  { id: 'plata', label: 'Plata', sub: 'Claro · predeterminado', bg: 'linear-gradient(160deg,#ffffff,#e3e8ef)', fg: '#111722' },
  { id: 'papel', label: 'Papel', sub: 'Claro y cálido', bg: '#f4efe4', fg: '#1f1b16' },
  { id: 'noche', label: 'Noche', sub: 'Oscuro', bg: 'radial-gradient(120% 90% at 70% 20%,#1d2a47,#070a12)', fg: '#eef1f7' },
  { id: 'tinta', label: 'Tinta', sub: 'Oscuro holográfico', bg: 'linear-gradient(135deg,#0b1020,#1b1640 55%,#0c2a33)', fg: '#f3f1ff' },
];

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;

export function Ajustes() {
  const toast = useToast();
  const feather = useFeather();
  const [s, set] = useSettings();
  const [protegido, setProtegido] = useState<boolean | null>(null);
  const [, refrescar] = useState(0);
  const cuentas = useLiveQuery(async () => ({ poemas: await db.poems.count(), libros: await db.books.count(), ideas: await db.ideas.count() }), []);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setProtegido).catch(() => setProtegido(null));
    return alCambiarInstalacion(() => refrescar((n) => n + 1));
  }, []);

  const copia = async () => {
    const blob = await crearCopia();
    const r = await guardarArchivo(blob, nombreArchivo('pluma-plateada-copia', 'pluma'), { compartir: true });
    if (r !== 'cancelado') {
      await marcarCopiaHecha();
      feather.celebrate();
      toast('Copia guardada. Guárdala en Drive o envíatela.');
    }
  };

  const importar = async () => {
    const file = await elegirArchivo('.pluma,application/json');
    if (!file) return;
    try {
      const r = await importarCopia(file);
      toast(`Importado: ${r.poemas} poemas, ${r.libros} libros, ${r.ideas} ideas`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <main className="screen">
      <TopBar title="Copias y ajustes" />

      <section className="card pad stack" style={{ marginTop: 14 }}>
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(53,201,196,0.16)', color: '#1f9c98', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <Icon name="shield" size={20} />
          </span>
          <div className="grow stack" style={{ gap: 4 }}>
            <b>Todo se guarda en este dispositivo</b>
            <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
              Se guarda solo mientras escribes, también sin conexión. No hay cuentas ni nube: haz copias de vez en cuando.
            </span>
            {protegido === false && (
              <button
                className="btn small"
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
                onClick={async () => {
                  await requestPersistence();
                  setProtegido(await navigator.storage.persisted());
                }}
              >
                Proteger mis datos
              </button>
            )}
            {protegido && <span className="meta">Almacenamiento protegido: el navegador no lo borrará.</span>}
          </div>
        </div>
        {cuentas && (
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="chip" style={{ cursor: 'default' }}>
              {plural(cuentas.poemas, 'poema')}
            </span>
            <span className="chip" style={{ cursor: 'default' }}>
              {plural(cuentas.libros, 'libro')}
            </span>
            <span className="chip" style={{ cursor: 'default' }}>
              {plural(cuentas.ideas, 'idea')}
            </span>
          </div>
        )}
        <div style={{ height: 1, background: 'var(--line)' }} />
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="grow">
            <div className="meta">Última copia</div>
            <div style={{ fontWeight: 500 }}>{s.lastBackupAt ? haceCuanto(s.lastBackupAt) : 'Nunca'}</div>
          </div>
          <button className="btn primary" onClick={copia}>
            <Icon name="download" size={17} /> Hacer copia ahora
          </button>
        </div>
        <span className="meta">Se descarga un archivo .pluma con todos tus poemas, libros, ideas e historial.</span>
      </section>

      <section style={{ marginTop: 14 }}>
        <button className="list-row" onClick={importar}>
          <Icon name="upload" size={19} />
          <span className="grow">Importar una copia (.pluma)</span>
        </button>
        <button className="list-row" onClick={async () => guardarArchivo(await exportarTexto('md'), nombreArchivo('mis-poemas', 'md'), { compartir: true })}>
          <Icon name="doc" size={19} />
          <span className="grow">Exportar todo como texto (.md)</span>
        </button>
        <button className="list-row" onClick={async () => guardarArchivo(await exportarTexto('txt'), nombreArchivo('mis-poemas', 'txt'), { compartir: true })}>
          <Icon name="doc" size={19} />
          <span className="grow">Exportar todo como texto plano (.txt)</span>
        </button>
        <Toggle label="Recordarme hacer copia cada semana" checked={s.remindBackup} onChange={(remindBackup) => set({ remindBackup })} />
      </section>

      <Instalacion />

      <h2 className="section-title serif" style={{ fontSize: 24, fontWeight: 500 }}>
        Apariencia
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        {TEMAS.map((t) => (
          <button
            key={t.id}
            aria-pressed={s.theme === t.id}
            onClick={() => set({ theme: t.id })}
            style={{
              height: 92,
              borderRadius: 16,
              border: s.theme === t.id ? '2px solid var(--primary)' : '1px solid var(--line-strong)',
              background: t.bg,
              color: t.fg,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              padding: 12,
              textAlign: 'left',
            }}
          >
            <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>
              {t.label}
            </span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{t.sub}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <Toggle label="Pantalla de bienvenida al abrir" hint="La pluma y una invitación a escribir antes de entrar" checked={s.showIntro} onChange={(showIntro) => set({ showIntro })} />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginTop: 16 }}>
        <span>Animación de la pluma</span>
        <Seg
          label="Animación de la pluma"
          value={s.animation}
          onChange={(animation) => set({ animation })}
          options={[
            ['completa', 'Completa'],
            ['suave', 'Suave'],
            ['off', 'Sin 3D'],
          ]}
        />
      </div>

      <h2 className="section-title serif" style={{ fontSize: 24, fontWeight: 500 }}>
        Escritura
      </h2>
      <div className="stack" style={{ gap: 4 }}>
        <Toggle label="Mostrar la métrica al escribir" hint="Sílabas y letra de rima junto a cada verso" checked={s.showMetrics} onChange={(showMetrics) => set({ showMetrics })} />
        <label className="field" style={{ marginTop: 10 }}>
          Tamaño de letra del editor: {s.editorSize}px
          <input type="range" min={16} max={30} value={s.editorSize} onChange={(e) => set({ editorSize: Number(e.target.value) })} />
        </label>
        <label className="field" style={{ marginTop: 10 }}>
          Tu nombre (firma en el lienzo y autor de los libros)
          <input className="input" value={s.author} onChange={(e) => set({ author: e.target.value })} placeholder="Opcional" />
        </label>
      </div>

      <h2 className="section-title serif" style={{ fontSize: 24, fontWeight: 500 }}>
        Acerca de
      </h2>
      <div className="stack muted" style={{ gap: 8, fontSize: 13, lineHeight: 1.5 }}>
        <span>Pluma Plateada · editor de poesía. Funciona sin conexión y sin cuentas.</span>
        <span>Sinónimos y vocabulario de rimas: tesauro de LibreOffice para español (Marcelo Garrone, LGPL 2.1).</span>
        <span>Tipografías: Cormorant Garamond, Inter, Caveat y Dancing Script (SIL Open Font License).</span>
      </div>
    </main>
  );
}

function Instalacion() {
  if (instalada()) {
    return (
      <div className="card pad row" style={{ marginTop: 14 }}>
        <img src={plumin} alt="" style={{ height: 44, transform: 'rotate(-20deg)' }} />
        <span className="grow">Pluma Plateada está instalada en este dispositivo.</span>
        <Icon name="check" />
      </div>
    );
  }
  return (
    <div className="card pad stack" style={{ marginTop: 14, borderColor: 'rgba(111,102,242,0.4)' }}>
      <div className="row">
        <img src={plumin} alt="" style={{ height: 52, transform: 'rotate(-20deg)' }} />
        <div className="grow">
          <b>Instálala en el móvil</b>
          <div className="muted" style={{ fontSize: 13 }}>
            Se abre desde la pantalla de inicio, a pantalla completa y sin conexión.
          </div>
        </div>
        {puedeInstalar() && (
          <button className="btn small" onClick={() => instalar()}>
            <Icon name="install" size={16} /> Instalar
          </button>
        )}
      </div>
      {!puedeInstalar() && (
        <span className="meta">
          {esIOS()
            ? 'En iPhone o iPad: abre esta página en Safari, toca Compartir y elige «Añadir a pantalla de inicio».'
            : 'En Android: abre el menú del navegador (⋮) y elige «Instalar aplicación» o «Añadir a pantalla de inicio».'}
        </span>
      )}
    </div>
  );
}
