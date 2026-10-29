import { describe, expect, it } from 'vitest';
import { libroCompleto, type Book, type Poem } from '../db/db';
import { maquetarLibro, textoCreditos, type Medidor } from './maquetaLibro';

const med: Medidor = { ancho: (t, _f, size) => t.length * size * 0.48 };

const poema = (id: string, title: string, versos: number): Poem => ({
  id,
  title,
  text: Array.from({ length: versos }, (_, i) => `Verso número ${i + 1} de este poema`).join('\n'),
  status: 'terminado',
  align: 'left',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
});

function libro(extra: Partial<Book> = {}) {
  return libroCompleto({
    id: 'b1',
    title: 'Las horas plateadas',
    subtitle: 'Poemas',
    author: 'Ana Prueba',
    dedication: 'A mi madre',
    parts: [
      { id: 'p1', title: 'Primera luz', poemIds: ['a', 'b'] },
      { id: 'p2', title: 'Noche', poemIds: ['c'] },
    ],
    layout: { page: 'a5', fontSize: 12, margins: 'normal', toc: true, newPagePerPoem: true, partPages: true, pageNumbers: true },
    createdAt: Date.UTC(2026, 0, 1),
    updatedAt: 0,
    ...extra,
  });
}

const poemas = new Map([poema('a', 'Alba', 6), poema('b', 'Mediodía', 60), poema('c', 'Vela', 4)].map((p) => [p.id, p]));

describe('maquetación del libro', () => {
  it('el índice apunta a la página real de cada poema', () => {
    const m = maquetarLibro(libro(), poemas, med);
    const interiores = m.paginas.filter((p) => p.tipo === 'interior');
    const indice = interiores.filter((p) => p.nombre === 'Índice').flatMap((p) => p.ops);
    for (const titulo of ['Alba', 'Mediodía', 'Vela']) {
      const fila = indice.find((o) => o.t === 'text' && o.text === titulo)!;
      expect(fila).toBeTruthy();
      const num = indice.find((o) => o.t === 'text' && o.f === 'r' && /^\d+$/.test(o.text) && o.y === (fila as { y: number }).y) as { text: string };
      const pagina = interiores[Number(num.text) - 1];
      expect(pagina.nombre).toBe(titulo);
    }
  });

  it('las partes empiezan en página impar y las cubiertas no cuentan', () => {
    const m = maquetarLibro(libro(), poemas, med);
    expect(m.paginas[0].tipo).toBe('cubierta');
    expect(m.paginas[m.paginas.length - 1].tipo).toBe('contracubierta');
    const interiores = m.paginas.filter((p) => p.tipo === 'interior');
    const partes = interiores.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.nombre === 'Primera luz' || p.nombre === 'Noche');
    expect(partes.length).toBe(2);
    partes.forEach(({ n }) => expect(n % 2).toBe(1));
  });

  it('un poema largo continúa en varias páginas numeradas', () => {
    const m = maquetarLibro(libro(), poemas, med);
    const paginasMediodia = m.paginas.filter((p) => p.nombre === 'Mediodía');
    expect(paginasMediodia.length).toBeGreaterThan(1);
    paginasMediodia.forEach((p) => expect(p.folio).not.toBeNull());
  });

  it('créditos con licencia y sin cubierta si se desactiva', () => {
    const b = libro({ layout: { page: 'a5', fontSize: 12, margins: 'normal', toc: false, newPagePerPoem: false, partPages: false, pageNumbers: true, includeCover: false } });
    const m = maquetarLibro(b, poemas, med);
    expect(m.paginas.some((p) => p.tipo !== 'interior')).toBe(false);
    expect(textoCreditos(b)[0]).toBe('© 2026, Ana Prueba');
    expect(textoCreditos(b).join(' ')).toContain('Todos los derechos reservados');
  });
});
