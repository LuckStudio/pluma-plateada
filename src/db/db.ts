import Dexie, { type Table } from 'dexie';

export type Estado = 'borrador' | 'terminado';

export interface Poem {
  id: string;
  title: string;
  text: string;
  status: Estado;
  align: 'left' | 'center';
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PoemVersion {
  id?: number;
  poemId: string;
  title: string;
  text: string;
  at: number;
}

export interface BookPart {
  id: string;
  title: string;
  poemIds: string[];
}

export interface BookLayout {
  page: 'a5' | '13x20' | 'a4';
  fontSize: 11 | 12 | 13;
  margins: 'normal' | 'amplio';
  toc: boolean;
  newPagePerPoem: boolean;
  partPages: boolean;
  pageNumbers: boolean;
}

export interface Book {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  dedication: string;
  parts: BookPart[];
  layout: BookLayout;
  createdAt: number;
  updatedAt: number;
}

export interface Idea {
  id: string;
  text: string;
  createdAt: number;
}

export type Theme = 'plata' | 'papel' | 'noche' | 'tinta';

export interface Settings {
  key: 'app';
  theme: Theme;
  animation: 'completa' | 'suave' | 'off';
  remindBackup: boolean;
  lastBackupAt: number | null;
  editorSize: number;
  showMetrics: boolean;
  author: string;
  seeded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  key: 'app',
  theme: 'plata',
  animation: 'completa',
  remindBackup: true,
  lastBackupAt: null,
  editorSize: 21,
  showMetrics: true,
  author: '',
  seeded: false,
};

export const DEFAULT_LAYOUT: BookLayout = {
  page: 'a5',
  fontSize: 12,
  margins: 'normal',
  toc: true,
  newPagePerPoem: true,
  partPages: true,
  pageNumbers: true,
};

class PlumaDB extends Dexie {
  poems!: Table<Poem, string>;
  versions!: Table<PoemVersion, number>;
  books!: Table<Book, string>;
  ideas!: Table<Idea, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('pluma-plateada');
    this.version(1).stores({
      poems: 'id, updatedAt, status',
      versions: '++id, poemId, at',
      books: 'id, updatedAt',
      ideas: 'id, createdAt',
      settings: 'key',
    });
  }
}

export const db = new PlumaDB();

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).replace(/-/g, '').slice(0, 16);

export const EJEMPLO = {
  title: 'El pasado nunca falla',
  text: [
    'El pasado nunca falla.',
    'El pasado siempre vuelve.',
    'No importa cuánto corras,',
    'al final te vuelve a alcanzar.',
    'La única opción que tenemos',
    'es aprender a convivir,',
    'recordando todo lo bueno',
    'y aprovechando para aprender,',
    'de aquello que fue malo.',
  ].join('\n'),
};

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('app');
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(patch: Partial<Settings>) {
  const s = await getSettings();
  await db.settings.put({ ...s, ...patch, key: 'app' });
}

// Primer arranque: crea el poema de ejemplo una sola vez.
export async function seedIfNeeded() {
  const s = await getSettings();
  if (s.seeded) return;
  if ((await db.poems.count()) === 0) {
    const now = Date.now();
    await db.poems.add({ id: uid(), ...EJEMPLO, status: 'terminado', align: 'left', tags: [], createdAt: now, updatedAt: now });
  }
  await saveSettings({ seeded: true });
}

export async function createPoem(text = '', title = ''): Promise<string> {
  const now = Date.now();
  const id = uid();
  await db.poems.add({ id, title, text, status: 'borrador', align: 'left', tags: [], createdAt: now, updatedAt: now });
  requestPersistence();
  return id;
}

export async function updatePoem(id: string, patch: Partial<Poem>) {
  await db.poems.update(id, { ...patch, updatedAt: Date.now() });
}

const VERSION_EVERY = 10 * 60 * 1000;
// Guarda una instantánea si la última tiene más de 10 minutos (o si se fuerza).
export async function snapshot(poem: Poem, force = false) {
  const last = await db.versions.where('poemId').equals(poem.id).reverse().sortBy('at');
  const prev = last[0];
  if (prev && prev.text === poem.text && prev.title === poem.title) return;
  if (!force && prev && Date.now() - prev.at < VERSION_EVERY) return;
  await db.versions.add({ poemId: poem.id, title: poem.title, text: poem.text, at: Date.now() });
  // Conserva las 30 más recientes por poema.
  const all = await db.versions.where('poemId').equals(poem.id).sortBy('at');
  if (all.length > 30) await db.versions.bulkDelete(all.slice(0, all.length - 30).map((v) => v.id!));
}

export async function deletePoem(id: string) {
  await db.transaction('rw', db.poems, db.versions, db.books, async () => {
    await db.poems.delete(id);
    await db.versions.where('poemId').equals(id).delete();
    const books = await db.books.toArray();
    for (const b of books) {
      if (b.parts.some((p) => p.poemIds.includes(id))) {
        await db.books.update(b.id, { parts: b.parts.map((p) => ({ ...p, poemIds: p.poemIds.filter((x) => x !== id) })) });
      }
    }
  });
}

export async function createBook(title = 'Poemario sin título'): Promise<string> {
  const now = Date.now();
  const id = uid();
  const s = await getSettings();
  await db.books.add({
    id,
    title,
    subtitle: '',
    author: s.author,
    dedication: '',
    parts: [{ id: uid(), title: 'Parte I', poemIds: [] }],
    layout: { ...DEFAULT_LAYOUT },
    createdAt: now,
    updatedAt: now,
  });
  requestPersistence();
  return id;
}

export async function updateBook(id: string, patch: Partial<Book>) {
  await db.books.update(id, { ...patch, updatedAt: Date.now() });
}

// Pide al navegador que no borre los datos aunque falte espacio.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* sin soporte */
  }
}

export function poemTitle(p: Pick<Poem, 'title' | 'text'>) {
  if (p.title.trim()) return p.title.trim();
  const first = p.text.split('\n').find((l) => l.trim());
  return first ? first.trim().replace(/[.,;:]+$/, '') : 'Sin título';
}
