import { describe, expect, it } from 'vitest';
import { silabear, medirVerso, terminacion, analizarPoema } from './index';

describe('silabeo', () => {
  const casos: Record<string, string> = {
    azucena: 'a-zu-ce-na',
    tempestad: 'tem-pes-tad',
    ardiente: 'ar-dien-te',
    honesto: 'ho-nes-to',
    cabello: 'ca-be-llo',
    enhiesto: 'en-hies-to',
    desordena: 'de-sor-de-na',
    instante: 'ins-tan-te',
    obstruir: 'obs-truir',
    poeta: 'po-e-ta',
    río: 'rí-o',
    guerra: 'gue-rra',
    pingüino: 'pin-güi-no',
    ahora: 'a-ho-ra',
    muy: 'muy',
    hoy: 'hoy',
    ayer: 'a-yer',
    aprovechando: 'a-pro-ve-chan-do',
    alcanzar: 'al-can-zar',
    búho: 'bú-ho',
    cuánto: 'cuán-to',
    lágrima: 'lá-gri-ma',
  };
  for (const [w, s] of Object.entries(casos)) {
    it(w, () => expect(silabear(w).join('-')).toBe(s));
  }
});

describe('medida de versos', () => {
  const garcilaso = [
    'En tanto que de rosa y azucena',
    'se muestra la color en vuestro gesto,',
    'y que vuestro mirar ardiente, honesto,',
    'con clara luz la tempestad serena;',
    'y en tanto que el cabello, que en la vena',
    'del oro se escogió, con vuelo presto',
    'por el hermoso cuello blanco, enhiesto,',
    'el viento mueve, esparce y desordena:',
  ];
  for (const v of garcilaso) it(`endecasílabo: ${v}`, () => expect(medirVerso(v).medida).toBe(11));

  it('ley del acento final', () => {
    expect(medirVerso('el amor').final).toBe('aguda');
    expect(medirVerso('al final te vuelve a alcanzar.').medida).toBe(9);
    expect(medirVerso('la luz de las lágrimas').final).toBe('esdrújula');
  });

  it('octosílabos de romance', () => {
    expect(medirVerso('Que por mayo era, por mayo,').medida).toBe(8);
    expect(medirVerso('Yo las amo, yo las oigo,').medida).toBe(8);
  });

  it('marca la sinalefa', () => {
    const v = medirVerso('y que vuestro mirar ardiente, honesto,');
    expect(v.silabasMetricas.map((s) => s.texto)).toContain('te‿ho');
    expect(v.subtipo).toBe('melódico');
  });
});

describe('rima', () => {
  it('consonante y asonante', () => {
    expect(terminacion('azucena')!.consonante).toBe('ena');
    expect(terminacion('serena')!.consonante).toBe('ena');
    expect(terminacion('gesto')!.asonante).toBe('e-o');
    expect(terminacion('cielo')!.consonante).toBe('elo');
    expect(terminacion('lágrima')!.asonante).toBe('a-a');
    expect(terminacion('amor')!.asonante).toBe('o');
    expect(terminacion('Lidia')!.asonante).toBe('i-a');
  });

  it('soneto en curso', () => {
    const a = analizarPoema(
      'En tanto que de rosa y azucena\nse muestra la color en vuestro gesto,\ny que vuestro mirar ardiente, honesto,\ncon clara luz la tempestad serena;\n\ny en tanto que el cabello, que en la vena\ndel oro se escogió, con vuelo presto\npor el hermoso cuello blanco, enhiesto,\nel viento mueve, esparce y desordena:',
    );
    expect(a.esquema).toBe('ABBA ABBA');
    expect(a.estrofas[0].nombre).toBe('cuarteto');
    expect(a.forma).toBe('Soneto (en curso)');
  });
});

describe('poema de ejemplo', () => {
  const poema =
    'El pasado nunca falla.\nEl pasado siempre vuelve.\nNo importa cuánto corras,\nal final te vuelve a alcanzar.\nLa única opción que tenemos\nes aprender a convivir,\nrecordando todo lo bueno\ny aprovechando para aprender,\nde aquello que fue malo.';
  it('mide cada verso', () => {
    const a = analizarPoema(poema);
    expect(a.lineas.map((l) => l?.verso.medida)).toEqual([8, 8, 7, 9, 8, 9, 9, 10, 7]);
    expect(a.forma.startsWith('Verso libre')).toBe(true);
    expect(a.stats.versos).toBe(9);
  });
});
