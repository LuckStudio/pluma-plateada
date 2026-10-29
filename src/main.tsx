import { createRoot } from 'react-dom/client';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/caveat/latin-500.css';
import '@fontsource/dancing-script/latin-500.css';
import './styles/global.css';
import { App } from './App';
import './lib/install';

createRoot(document.getElementById('root')!).render(<App />);

// Service worker (modo sin conexión) solo cuando la app no está incrustada en otra página.
if ('serviceWorker' in navigator && import.meta.env.PROD && window.self === window.top) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {});
}
