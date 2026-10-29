import { useEffect, useRef, useState } from 'react';
import { useFeather } from '../components/Feather';
import plumaImg from '../assets/pluma.png';

const FRASES = [
  'Hoy puede nacer un poema.',
  'Hay un verso esperándote.',
  'Escribe lo que hoy te ronda.',
  'Hoy también es buen día para un poema.',
];

function frase() {
  const d = new Date();
  return FRASES[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % FRASES.length];
}

// Bienvenida: la pluma flota y una frase invita a escribir. Al tocar, la pluma atraviesa
// la cámara, las palabras se disuelven y se revela Inicio.
export function Intro({ ready, onEntrar }: { ready: boolean; onEntrar: () => void }) {
  const feather = useFeather();
  const [lista, setLista] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const texto = useRef(frase()).current;
  const palabras = texto.split(' ');
  const fecha = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => {
    feather.setMode('intro');
    const t = setTimeout(() => setLista(true), 900);
    return () => clearTimeout(t);
  }, [feather]);

  useEffect(() => {
    if (lista && ready) ref.current?.focus();
  }, [lista, ready]);

  const entrar = () => {
    if (!ready || saliendo) return;
    setSaliendo(true);
    const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    feather.zoomThrough(reducido ? 200 : 900);
    setTimeout(onEntrar, reducido ? 150 : 520);
  };

  return (
    <div className={`intro ${saliendo ? 'saliendo' : ''}`}>
      <div className="intro-glow" aria-hidden="true" />
      {!feather.enabled && <img className="intro-static" src={plumaImg} alt="" />}
      <div className="intro-flash" aria-hidden="true" />
      <button ref={ref} className="intro-hit" onClick={entrar} aria-label={`${texto} Toca para empezar a escribir`}>
        <span className="intro-text">
          <span className="eyebrow intro-fecha">{fecha}</span>
          <span className="intro-frase serif" aria-hidden="true">
            {palabras.map((p, i) => (
              <span key={i} className="intro-word" style={{ ['--i' as string]: i }}>
                {p}
              </span>
            ))}
          </span>
          <span className={`intro-hint ${lista && ready ? 'on' : ''}`} aria-hidden="true">
            Toca para empezar a escribir
          </span>
        </span>
      </button>
    </div>
  );
}
