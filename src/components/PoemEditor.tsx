import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { Analisis } from '../poesia';
import { RimaTag } from './ui';

export interface Caret {
  linea: number;
  palabra: string;
}

export interface PoemEditorHandle {
  focus: () => void;
  insertar: (texto: string) => void;
  insertarPar: (abre: string, cierra: string) => void;
  reemplazarPalabra: (palabra: string) => void;
  nuevaEstrofa: () => void;
  sangria: () => void;
  deshacer: () => void;
  rehacer: () => void;
}

const LETRA = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;

function palabraEn(texto: string, pos: number): [number, number] | null {
  let a = pos;
  let b = pos;
  while (a > 0 && LETRA.test(texto[a - 1])) a--;
  while (b < texto.length && LETRA.test(texto[b])) b++;
  return a === b ? null : [a, b];
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  analisis: Analisis;
  metrica: boolean;
  align: 'left' | 'center';
  size: number;
  caretLine: number;
  onCaret: (c: Caret) => void;
}

export const PoemEditor = forwardRef<PoemEditorHandle, Props>(function PoemEditor({ value, onChange, analisis, metrica, align, size, caretLine, onCaret }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, size, metrica, align]);

  const leerCaret = () => {
    const el = ta.current;
    if (!el) return;
    const pos = el.selectionStart;
    const linea = el.value.slice(0, pos).split('\n').length - 1;
    let palabra = '';
    if (el.selectionEnd > el.selectionStart) {
      palabra = (el.value.slice(el.selectionStart, el.selectionEnd).match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/) ?? [''])[0];
    } else {
      const r = palabraEn(el.value, pos);
      palabra = r ? el.value.slice(r[0], r[1]) : '';
    }
    onCaret({ linea, palabra });
  };

  // Inserta respetando el historial de deshacer del navegador cuando es posible.
  const escribir = (texto: string, desde: number, hasta: number) => {
    const el = ta.current!;
    el.focus();
    el.setSelectionRange(desde, hasta);
    const ok = texto ? document.execCommand('insertText', false, texto) : document.execCommand('delete');
    if (!ok) {
      el.setRangeText(texto, desde, hasta, 'end');
      onChange(el.value);
    }
    leerCaret();
  };

  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    insertar: (t) => {
      const el = ta.current!;
      escribir(t, el.selectionStart, el.selectionEnd);
    },
    insertarPar: (abre, cierra) => {
      const el = ta.current!;
      const [a, b] = [el.selectionStart, el.selectionEnd];
      const dentro = el.value.slice(a, b);
      escribir(abre + dentro + cierra, a, b);
      const pos = a + abre.length + dentro.length;
      el.setSelectionRange(pos, pos);
    },
    reemplazarPalabra: (p) => {
      const el = ta.current!;
      const r = el.selectionEnd > el.selectionStart ? ([el.selectionStart, el.selectionEnd] as [number, number]) : palabraEn(el.value, el.selectionStart);
      if (r) escribir(p, r[0], r[1]);
      else {
        const antes = el.value[el.selectionStart - 1];
        escribir((antes && antes !== ' ' && antes !== '\n' ? ' ' : '') + p, el.selectionStart, el.selectionEnd);
      }
    },
    nuevaEstrofa: () => {
      const el = ta.current!;
      const fin = el.value.indexOf('\n', el.selectionEnd);
      const pos = fin === -1 ? el.value.length : fin;
      escribir('\n\n', pos, pos);
    },
    sangria: () => {
      const el = ta.current!;
      const inicio = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1;
      const caret = el.selectionStart;
      if (el.value[inicio] === ' ') {
        escribir('', inicio, inicio + 1);
        el.setSelectionRange(Math.max(inicio, caret - 1), Math.max(inicio, caret - 1));
      } else {
        escribir(' ', inicio, inicio);
        el.setSelectionRange(caret + 1, caret + 1);
      }
    },
    deshacer: () => {
      ta.current?.focus();
      document.execCommand('undo');
    },
    rehacer: () => {
      ta.current?.focus();
      document.execCommand('redo');
    },
  }));

  const lineas = value.split('\n');
  return (
    <div className={`pe ${align === 'center' ? 'center' : ''} ${metrica ? '' : 'nometa'}`} style={{ ['--pe-size' as string]: `${size}px` }}>
      <div className="pe-mirror" aria-hidden="true">
        {lineas.map((l, i) => {
          const a = analisis.lineas[i];
          return (
            <div key={i} className={`pe-line ${i === caretLine ? 'current' : ''}`}>
              {l || '​'}
              {metrica && a && (
                <span className="pe-meta">
                  <span className="n">{a.verso.medida}</span>
                  <RimaTag letra={a.rima.letra} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <textarea
        ref={ta}
        className="pe-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={leerCaret}
        onKeyUp={leerCaret}
        onClick={leerCaret}
        placeholder={'Escribe aquí tu poema…\nUn verso por línea, una línea en blanco entre estrofas.'}
        spellCheck
        autoCapitalize="sentences"
        aria-label="Texto del poema"
      />
    </div>
  );
});
