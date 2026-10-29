// Copias de seguridad (.pluma) y exportación de texto.
import { db, getSettings, poemTitle, saveSettings, type Book, type Idea, type Poem, type PoemVersion } from './db';

interface Copia {
  app: 'pluma-plateada';
  formato: 1;
  exportadoEn: string;
  poems: Poem[];
  versions: PoemVersion[];
  books: Book[];
  ideas: Idea[];
  settings: Record<string, unknown>;
}

export async function crearCopia(): Promise<Blob> {
  const s = await getSettings();
  const data: Copia = {
    app: 'pluma-plateada',
    formato: 1,
    exportadoEn: new Date().toISOString(),
    poems: await db.poems.toArray(),
    versions: await db.versions.toArray(),
    books: await db.books.toArray(),
    ideas: await db.ideas.toArray(),
    settings: { theme: s.theme, animation: s.animation, author: s.author, editorSize: s.editorSize, showMetrics: s.showMetrics },
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function marcarCopiaHecha() {
  await saveSettings({ lastBackupAt: Date.now() });
}

export interface ResultadoImportacion {
  poemas: number;
  libros: number;
  ideas: number;
}

// Fusiona: lo que ya existe se conserva salvo que la copia sea más reciente.
export async function importarCopia(file: File): Promise<ResultadoImportacion> {
  const data = JSON.parse(await file.text()) as Partial<Copia>;
  if (data.app !== 'pluma-plateada' || !Array.isArray(data.poems)) throw new Error('Este archivo no es una copia de Pluma Plateada.');
  let poemas = 0;
  let libros = 0;
  let ideas = 0;
  await db.transaction('rw', [db.poems, db.versions, db.books, db.ideas], async () => {
    for (const p of data.poems ?? []) {
      const cur = await db.poems.get(p.id);
      if (!cur || cur.updatedAt < p.updatedAt) {
        await db.poems.put(p);
        poemas++;
      }
    }
    for (const b of data.books ?? []) {
      const cur = await db.books.get(b.id);
      if (!cur || cur.updatedAt < b.updatedAt) {
        await db.books.put(b);
        libros++;
      }
    }
    for (const i of data.ideas ?? []) {
      if (!(await db.ideas.get(i.id))) {
        await db.ideas.put(i);
        ideas++;
      }
    }
    const existentes = new Set((await db.versions.toArray()).map((v) => `${v.poemId}:${v.at}`));
    for (const v of data.versions ?? []) {
      if (!existentes.has(`${v.poemId}:${v.at}`)) await db.versions.add({ poemId: v.poemId, title: v.title, text: v.text, at: v.at });
    }
  });
  return { poemas, libros, ideas };
}

export async function exportarTexto(formato: 'md' | 'txt'): Promise<Blob> {
  const poems = (await db.poems.toArray()).sort((a, b) => a.createdAt - b.createdAt);
  const cuerpo = poems
    .map((p) => {
      const t = poemTitle(p);
      return formato === 'md' ? `## ${t}\n\n${p.text.split('\n').join('  \n')}` : `${t.toUpperCase()}\n\n${p.text}`;
    })
    .join(formato === 'md' ? '\n\n---\n\n' : '\n\n\n');
  const cabecera = formato === 'md' ? '# Mis poemas\n\n' : '';
  return new Blob([cabecera + cuerpo + '\n'], { type: formato === 'md' ? 'text/markdown' : 'text/plain' });
}

export function nombreArchivo(base: string, ext: string) {
  const fecha = new Date().toISOString().slice(0, 10);
  const limpio = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${limpio || 'pluma'}-${fecha}.${ext}`;
}
