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
  runningHeads?: boolean; // título del libro y de la parte en la cabecera
  poemAlign?: 'izquierda' | 'bloque'; // bloque: el poema se centra como bloque en la página
  titleCase?: 'normal' | 'versalitas';
  ornament?: boolean; // filete bajo el título de cada poema
  includeCover?: boolean; // cubierta y contracubierta dentro del PDF
  folio?: 'centro' | 'exterior';
}

export type CoverStyle = 'plata' | 'papel' | 'noche' | 'tinta' | 'color' | 'imagen';

export interface BookCover {
  style: CoverStyle;
  color: string;
  image: string; // data URL (JPEG) cuando style = imagen
  layout: 'arriba' | 'centrado' | 'abajo';
  font: 'cormorant' | 'caveat' | 'dancing' | 'inter';
  feather: boolean;
}

export interface BookBack {
  blurb: string; // sinopsis de contracubierta
  bio: string;
  barcode: boolean; // reserva hueco para el código de barras
}

export type Licencia = 'reservados' | 'cc-by' | 'cc-by-sa' | 'cc-by-nc' | 'cc-by-nc-nd';

export interface BookLegal {
  year: string;
  edition: string;
  publisher: string;
  isbn: string;
  deposito: string;
  coverDesign: string;
  printedIn: string;
  rights: Licencia;
  extra: string;
}

export interface BookExtras {
  epigraph: string;
  epigraphAuthor: string;
  prologue: string;
  acknowledgements: string;
  aboutAuthor: string;
  colophon: string;
}

export interface Book {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  dedication: string;
  parts: BookPart[];
  layout: BookLayout;
  cover?: BookCover;
  back?: BookBack;
  legal?: BookLegal;
  extras?: BookExtras;
  createdAt: number;
  updatedAt: number;
}

export type LibroCompleto = Book & {
  layout: Required<BookLayout>;
  cover: BookCover;
  back: BookBack;
  legal: BookLegal;
  extras: BookExtras;
};

// Rellena los campos que los libros antiguos aún no tienen.
export function libroCompleto(b: Book): LibroCompleto {
  return {
    ...b,
    layout: { ...DEFAULT_LAYOUT, ...b.layout },
    cover: { ...DEFAULT_COVER, ...b.cover },
    back: { ...DEFAULT_BACK, ...b.back },
    legal: { ...DEFAULT_LEGAL, year: String(new Date(b.createdAt).getFullYear()), ...b.legal },
    extras: { ...DEFAULT_EXTRAS, ...b.extras },
  };
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
  showIntro: boolean;
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
  showIntro: true,
};

export const DEFAULT_LAYOUT: Required<BookLayout> = {
  page: 'a5',
  fontSize: 12,
  margins: 'normal',
  toc: true,
  newPagePerPoem: true,
  partPages: true,
  pageNumbers: true,
  runningHeads: true,
  poemAlign: 'bloque',
  titleCase: 'normal',
  ornament: true,
  includeCover: true,
  folio: 'centro',
};

export const DEFAULT_COVER: BookCover = { style: 'plata', color: '#1d2a47', image: '', layout: 'centrado', font: 'cormorant', feather: true };
export const DEFAULT_BACK: BookBack = { blurb: '', bio: '', barcode: true };
export const DEFAULT_LEGAL: BookLegal = {
  year: String(new Date().getFullYear()),
  edition: 'Primera edición',
  publisher: '',
  isbn: '',
  deposito: '',
  coverDesign: '',
  printedIn: '',
  rights: 'reservados',
  extra: '',
};
export const DEFAULT_EXTRAS: BookExtras = { epigraph: '', epigraphAuthor: '', prologue: '', acknowledgements: '', aboutAuthor: '', colophon: '' };

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

// Actualiza un libro a partir de su versión más reciente (evita pisar cambios de otros campos).
export async function patchLibro(id: string, fn: (b: LibroCompleto) => Partial<Book>) {
  await db.transaction('rw', db.books, async () => {
    const b = await db.books.get(id);
    if (!b) return;
    await db.books.put({ ...b, ...fn(libroCompleto(b)), updatedAt: Date.now() });
  });
}
