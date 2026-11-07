// Del lado del celular: graba la nota de voz, achica la captura y se la manda al lector.
import { LECTOR_URL, SUPABASE_ANON_KEY } from './config.js';
import { catalogoParaIA } from './categorias.js';

export async function leerConIA({ store, quien, audio, imagen, texto, hoy }) {
  const fd = new FormData();
  fd.append('catalogo', JSON.stringify(catalogoParaIA(quien)));
  fd.append('hoy', hoy);
  if (audio) fd.append('audio', audio, nombreAudio(audio));
  if (imagen) fd.append('imagen', await achicar(imagen), 'captura.jpg');
  if (texto) fd.append('texto', texto);
  const headers = {};
  const token = await store.token();
  if (token) { headers.Authorization = `Bearer ${token}`; headers.apikey = SUPABASE_ANON_KEY; }
  const r = await fetch(LECTOR_URL, { method: 'POST', body: fd, headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `El lector respondió ${r.status}`);
  return j;
}

function nombreAudio(b) {
  const t = (b.type || '').split(';')[0];
  const ext = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg',
    'audio/opus': 'ogg', 'audio/wav': 'wav', 'video/mp4': 'mp4' }[t] || (b.name?.split('.').pop()) || 'webm';
  return `nota.${ext}`;
}

/** Las capturas de celular pesan mucho: se mandan a 1600 px como máximo. */
async function achicar(archivo) {
  try {
    const bmp = await createImageBitmap(archivo);
    const esc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  } catch { return archivo; }
}

// ── Grabadora ────────────────────────────────────────────────────────────────
export class Grabadora {
  async empezar() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tipo = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t));
    this.rec = new MediaRecorder(this.stream, tipo ? { mimeType: tipo } : undefined);
    this.partes = [];
    this.rec.ondataavailable = (e) => e.data.size && this.partes.push(e.data);
    this.rec.start();
    this.inicio = Date.now();
  }
  terminar() {
    return new Promise((ok) => {
      this.rec.onstop = () => {
        this.stream.getTracks().forEach((t) => t.stop());
        ok(new Blob(this.partes, { type: (this.rec.mimeType || 'audio/webm').split(';')[0] }));
      };
      this.rec.stop();
    });
  }
  cancelar() { try { this.rec?.stop(); } catch {} this.stream?.getTracks().forEach((t) => t.stop()); }
}
