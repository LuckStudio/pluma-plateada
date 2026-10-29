// Instalación como app (PWA): guardamos el aviso del navegador para lanzarlo desde Ajustes.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let aviso: BeforeInstallPromptEvent | null = null;
const oyentes = new Set<() => void>();

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  aviso = e as BeforeInstallPromptEvent;
  oyentes.forEach((f) => f());
});
addEventListener('appinstalled', () => {
  aviso = null;
  oyentes.forEach((f) => f());
});

export const instalada = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const puedeInstalar = () => !!aviso;

export async function instalar() {
  if (!aviso) return false;
  await aviso.prompt();
  const r = await aviso.userChoice;
  aviso = null;
  oyentes.forEach((f) => f());
  return r.outcome === 'accepted';
}

export function alCambiarInstalacion(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}
