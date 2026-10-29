// Exporta la animación del poema (versos que aparecen con fundido) a vídeo.
// 1) WebCodecs + MP4 (rápido, H.264): Chrome, Edge, Android, Safari 16.4+.
// 2) Si no hay codificador, graba el canvas en tiempo real con MediaRecorder.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { dibujar, duracionVideo, maquetar, cargarPluma, cargarFuentes, formato, type LienzoOpts, type VideoOpts } from './lienzo';

export interface ResultadoVideo {
  blob: Blob;
  ext: 'mp4' | 'webm';
}

const FPS = 30;

// H.264 necesita dimensiones pares y hasta ~1920 px por lado en el nivel 4.x.
function dimensiones(w: number, h: number) {
  const s = Math.min(1, 1920 / Math.max(w, h));
  const even = (n: number) => Math.max(2, Math.round((n * s) / 2) * 2);
  return { w: even(w), h: even(h), s };
}

async function codecDisponible(w: number, h: number) {
  if (typeof VideoEncoder === 'undefined') return null;
  const opciones: { codec: string; mux: 'avc' | 'vp9' }[] = [
    { codec: 'avc1.640028', mux: 'avc' },
    { codec: 'avc1.4d0028', mux: 'avc' },
    { codec: 'avc1.42001f', mux: 'avc' },
    { codec: 'vp09.00.40.08', mux: 'vp9' },
  ];
  for (const o of opciones) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec: o.codec, width: w, height: h, bitrate: 8_000_000, framerate: FPS });
      if (r.supported) return o;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

export async function exportarVideo(o: LienzoOpts, v: VideoOpts, onProgress: (p: number) => void, signal?: AbortSignal): Promise<ResultadoVideo> {
  await Promise.all([cargarPluma(), cargarFuentes(o.font)]);
  const f = formato(o.format);
  const { w, h, s } = dimensiones(f.w, f.h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  // Maquetamos a tamaño completo y escalamos el dibujo.
  ctx.scale(s, s);
  const m = maquetar(ctx, o, f.w, f.h, 0);
  const total = duracionVideo(m, v);
  const frames = Math.ceil(total * FPS);

  const codec = await codecDisponible(w, h);
  if (codec) {
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { codec: codec.mux, width: w, height: h, frameRate: FPS }, fastStart: 'in-memory' });
    let error: unknown = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => (error = e),
    });
    enc.configure({ codec: codec.codec, width: w, height: h, bitrate: 8_000_000, framerate: FPS, ...(codec.mux === 'avc' ? { avc: { format: 'avc' } } : {}) });
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) {
        enc.close();
        throw new DOMException('Cancelado', 'AbortError');
      }
      if (error) throw error;
      dibujar(ctx, o, m, { t: i / FPS, v });
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
      if (i % 10 === 0) {
        onProgress(i / frames);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await enc.flush();
    enc.close();
    muxer.finalize();
    onProgress(1);
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4' };
  }

  // Reserva: grabación en tiempo real.
  const tipos = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = tipos.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('Este navegador no puede crear vídeos. Prueba con Chrome o Safari actualizados.');
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const fin = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(250);
  const t0 = performance.now();
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) {
        rec.stop();
        reject(new DOMException('Cancelado', 'AbortError'));
        return;
      }
      const t = (performance.now() - t0) / 1000;
      dibujar(ctx, o, m, { t: Math.min(t, total), v });
      onProgress(Math.min(1, t / total));
      if (t >= total) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await fin;
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext };
}
