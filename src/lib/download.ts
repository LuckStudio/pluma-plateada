interface DescargasClaude {
  save: (r: { filename: string; data: Blob }) => Promise<{ status: string }>;
}
const claude = (window as unknown as { claude?: { use: (n: string) => Promise<DescargasClaude | null> } }).claude;
const incrustada = window.self !== window.top;

// Entrega un archivo al usuario: compartir (móvil) o descargar.
// Incrustada en claude.ai, la descarga pasa por la capacidad "downloads" del visor.
export async function guardarArchivo(blob: Blob, nombre: string, opts: { compartir?: boolean } = {}) {
  if (claude && incrustada) {
    const downloads = await claude.use('downloads').catch(() => null);
    if (downloads) {
      // El visor solo admite extensiones conocidas: la copia .pluma viaja como .json.
      const filename = nombre.replace(/\.pluma$/, '.pluma.json');
      try {
        await downloads.save({ filename, data: blob });
        return 'descargado';
      } catch (e) {
        if ((e as { code?: string }).code === 'declined') return 'cancelado';
        throw new Error((e as { message?: string }).message ?? 'No se pudo guardar el archivo');
      }
    }
  }
  const file = new File([blob], nombre, { type: blob.type });
  if (opts.compartir && !incrustada && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nombre });
      return 'compartido';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelado';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'descargado';
}

export function puedeCompartirArchivos() {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

export function elegirArchivo(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
